// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';

import { Rush, RushConfiguration } from '@microsoft/rush-lib';
import { LastInstallFlag } from '@microsoft/rush-lib/lib/api/LastInstallFlag';
import { SubprocessTerminator } from '@rushstack/node-core-library';
import {
  DaemonClient,
  captureDaemonRequest,
  executeWithDaemonRestartAsync,
  type DaemonClientOutcome
} from '@rushstack/rush-client-core';
import {
  readDaemonLockfile,
  type IDaemonLockfile,
  type IDaemonPaths
} from '@rushstack/rush-daemon-transport';

import { createDeferred, type IDeferred } from './DaemonRequestWireTestUtilities';
import { stopSuccessorAsync } from './WorkspaceLifecycleTestProcess';
import { waitForTestProcessExitAsync } from './TestProcessExit';

export interface ISuccessfulMutationOutput {
  readonly exitCode: number | undefined;
  readonly stdout: string;
  readonly stderr: string;
}

export interface IMutationRequestOutput extends ISuccessfulMutationOutput {
  readonly outcome: DaemonClientOutcome;
}

interface ITrackedProcess {
  readonly child: ChildProcess;
  readonly completion: Promise<ISuccessfulMutationOutput>;
}

export class MutationGate implements AsyncDisposable {
  readonly #sockets: Set<net.Socket> = new Set();
  readonly #entered: IDeferred<void> = createDeferred();
  readonly #server: net.Server;
  #release: Promise<void> | undefined;
  public readonly port: number;
  public readonly entered: Promise<void> = this.#entered.promise;

  private constructor(server: net.Server, port: number) {
    this.#server = server;
    this.port = port;
    server.on('connection', (socket: net.Socket) => {
      this.#sockets.add(socket);
      socket.once('close', () => this.#sockets.delete(socket));
      this.#entered.resolve();
    });
  }

  public static async createAsync(): Promise<MutationGate> {
    const server: net.Server = net.createServer();
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address: net.AddressInfo | string | null = server.address();
    if (!address || typeof address === 'string') throw new Error('The mutation gate did not bind.');
    return new MutationGate(server, address.port);
  }

  public [Symbol.asyncDispose](): Promise<void> {
    this.#release ??= new Promise<void>((resolve, reject) => {
      for (const socket of this.#sockets) socket.end('continue\n');
      this.#server.close((error) => (error ? reject(error) : resolve()));
    });
    return this.#release;
  }
}

/** Real offline PNPM installation plus standalone native daemon processes, owned entirely by one test. */
export class SuccessfulMutationFixture implements AsyncDisposable {
  public readonly folder: string = fs.mkdtempSync(path.join(os.tmpdir(), 'rushd-successful-mutation-'));
  public readonly repoRoot: string = path.join(this.folder, 'repo');
  public readonly controlFolder: string = path.join(this.folder, 'control');
  public readonly environment: Readonly<Record<string, string>>;
  public readonly pnpmVersion: string;
  public paths: IDaemonPaths | undefined;
  public initialPid: number | undefined;
  readonly #processes: Set<ITrackedProcess> = new Set();
  #requestSequence: number = 0;
  #initialProcess: ITrackedProcess | undefined;

  private constructor(pnpmVersion: string) {
    this.pnpmVersion = pnpmVersion;
    const home: string = path.join(this.folder, 'home');
    fs.mkdirSync(home, { recursive: true });
    fs.mkdirSync(this.controlFolder, { recursive: true });
    fs.mkdirSync(path.join(this.folder, 'runtime'), { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(home, '.npmrc'), '');
    fs.writeFileSync(path.join(home, 'global.npmrc'), '');
    const environment: NodeJS.ProcessEnv = {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      XDG_RUNTIME_DIR: path.join(this.folder, 'runtime'),
      RUSH_GLOBAL_FOLDER: path.join(this.folder, 'rush-global'),
      RUSH_PNPM_STORE_PATH: path.join(this.folder, 'store'),
      RUSH_TEMP_FOLDER: undefined,
      RUSH_PREVIEW_VERSION: undefined,
      RUSH_VARIANT: undefined,
      RUSH_BUILD_CACHE_ENABLED: '0',
      RUSHD_MUTATION_TEST_CONTROL: this.controlFolder,
      NPM_CONFIG_USERCONFIG: path.join(home, '.npmrc'),
      NPM_CONFIG_GLOBALCONFIG: path.join(home, 'global.npmrc'),
      NPM_CONFIG_CACHE: path.join(this.folder, 'npm-cache'),
      NPM_CONFIG_AUDIT: 'false',
      NPM_CONFIG_FUND: 'false',
      CI: 'true',
      FORCE_COLOR: '0'
    };
    this.environment = Object.freeze(
      Object.fromEntries(
        Object.entries(environment).filter((entry): entry is [string, string] => entry[1] !== undefined)
      )
    );
  }

  public static async createAsync(): Promise<SuccessfulMutationFixture> {
    const sourceRushJson: string | undefined = RushConfiguration.tryFindRushJsonLocation({
      startingFolder: __dirname,
      showVerbose: false
    });
    if (!sourceRushJson) throw new Error('Cannot locate the installed workspace package manager.');
    const sourceTool: string = path.join(path.dirname(sourceRushJson), 'common/temp/pnpm-local');
    const packageFile: string = path.join(sourceTool, 'node_modules/pnpm/package.json');
    if (!fs.existsSync(packageFile))
      throw new Error('The declared PNPM tool is missing; restore workspace dependencies.');
    const packageJson: { name: string; version: string } = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
    if (packageJson.name !== 'pnpm') throw new Error('The workspace package manager is not PNPM.');
    const fixture: SuccessfulMutationFixture = new SuccessfulMutationFixture(packageJson.version);
    try {
      const tool: string = path.join(
        fixture.environment.RUSH_GLOBAL_FOLDER,
        `node-${process.version}`,
        `pnpm-${packageJson.version}`
      );
      fs.mkdirSync(tool, { recursive: true });
      // Reuse the installed distribution, not a shim. No user npmrc, registry credentials, or tool cache is modified.
      fs.cpSync(path.join(sourceTool, 'node_modules'), path.join(tool, 'node_modules'), {
        recursive: true,
        verbatimSymlinks: true
      });
      const actualVersion: string = execFileSync(
        process.execPath,
        [path.join(tool, 'node_modules/pnpm/bin/pnpm.cjs'), '--version'],
        { env: fixture.environment, encoding: 'utf8' }
      ).trim();
      if (actualVersion !== packageJson.version)
        throw new Error('The copied PNPM executable has an unexpected version.');
      await new LastInstallFlag(tool, { node: process.versions.node }).createAsync();
      fixture.#writeRepository();
      return fixture;
    } catch (error) {
      await fixture[Symbol.asyncDispose]();
      throw error;
    }
  }

  #writeRepository(): void {
    const write: (filename: string, value: string) => void = (filename, value) => {
      const absolute: string = path.join(this.repoRoot, filename);
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      fs.writeFileSync(absolute, value);
    };
    write(
      'rush.json',
      JSON.stringify({
        rushVersion: Rush.version,
        pnpmVersion: this.pnpmVersion,
        projectFolderMinDepth: 2,
        projectFolderMaxDepth: 2,
        daemon: { idleTimeoutSeconds: 120 },
        eventHooks: { postRushInstall: ['node common/scripts/mutation-postinstall.cjs'] },
        projects: ['provider-one', 'provider-two', 'app'].map((name) => ({
          packageName: `@mutation/${name}`,
          projectFolder: `projects/${name}`
        }))
      })
    );
    write(
      'common/config/rush/pnpm-config.json',
      JSON.stringify({
        useWorkspaces: true,
        pnpmStore: 'local',
        autoInstallPeers: false
      })
    );
    write('common/config/rush/experiments.json', JSON.stringify({ printEventHooksOutputToConsole: true }));
    write(
      'common/config/rush/.npmrc',
      'registry=http://127.0.0.1:9/\naudit=false\nfund=false\nupdate-notifier=false\n'
    );
    write(
      '.gitignore',
      'common/temp/\n**/node_modules/\n**/.rush/\n**/rush-logs/\n**/lib/\nbuild-runs.txt\n'
    );
    write(
      'fixtures/install-proof/package.json',
      JSON.stringify({
        name: '@mutation/install-proof',
        version: '1.0.0',
        main: 'index.js'
      })
    );
    write('fixtures/install-proof/index.js', "module.exports = 'installed';\n");
    for (const provider of ['provider-one', 'provider-two']) {
      write(
        `projects/${provider}/package.json`,
        JSON.stringify({
          name: `@mutation/${provider}`,
          version: '1.0.0',
          main: 'lib/index.js',
          dependencies: { '@mutation/install-proof': 'file:../../fixtures/install-proof' },
          scripts: { build: 'node build.cjs' }
        })
      );
      write(`projects/${provider}/value.txt`, provider);
      write(
        `projects/${provider}/build.cjs`,
        `
const fs = require('node:fs');
const value = fs.readFileSync('value.txt', 'utf8') + '-' + require('@mutation/install-proof');
fs.mkdirSync('lib', {recursive:true});
fs.writeFileSync('lib/index.js', 'module.exports = ' + JSON.stringify(value) + ';\\n');
fs.appendFileSync('../../build-runs.txt', value + '\\n');
console.log('BUILT:' + value);
`
      );
    }
    write(
      'projects/app/package.json',
      JSON.stringify({
        name: '@mutation/app',
        version: '1.0.0',
        dependencies: { '@mutation/provider-one': 'workspace:*' },
        scripts: { build: 'node build.cjs' }
      })
    );
    write('projects/app/state.txt', 'before');
    write(
      'projects/app/build.cjs',
      `
const fs = require('node:fs');
const name = Object.keys(require('./package.json').dependencies)[0];
const value = require(name) + ':' + fs.readFileSync('state.txt', 'utf8');
fs.mkdirSync('lib', {recursive:true});
fs.writeFileSync('lib/value.txt', value);
fs.appendFileSync('../../build-runs.txt', 'app:' + value + '\\n');
console.log('APP_RESULT:' + value);
`
    );
    write(
      'common/scripts/mutation-postinstall.cjs',
      `
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const controlFolder = process.env.RUSHD_MUTATION_TEST_CONTROL;
const controlFile = path.join(controlFolder, 'mutation.json');
if (fs.existsSync(controlFile)) {
  const control = JSON.parse(fs.readFileSync(controlFile, 'utf8'));
  fs.writeFileSync(path.join(__dirname, '../../projects/app/state.txt'), 'after-' + control.commandName);
  fs.appendFileSync(path.join(controlFolder, 'events.txt'), 'postinstall:' + control.commandName + '\\n');
  const socket = net.connect(control.postInstallPort, '127.0.0.1');
  socket.once('error', (error) => { console.error(error); process.exitCode = 1; });
  socket.once('data', () => {
    socket.end();
    process.stdout.write('FINAL_POST_INSTALL:' + control.commandName + '\\n');
  });
}
`
    );
    execFileSync('git', ['init', '--quiet'], { cwd: this.repoRoot });
    execFileSync('git', ['add', '.'], { cwd: this.repoRoot });
    execFileSync(
      'git',
      [
        '-c',
        'user.name=Mutation Test',
        '-c',
        'user.email=mutation@example.invalid',
        'commit',
        '--quiet',
        '-m',
        'isolated fixture'
      ],
      { cwd: this.repoRoot }
    );
  }

  public runWorkerAsync(commandName: 'install' | 'update'): Promise<ISuccessfulMutationOutput> {
    return this.#spawn([
      path.resolve(__dirname, '../NativeMutationWorker.js'),
      Rush.version,
      this.repoRoot,
      commandName,
      '--bypass-policy',
      '--offline'
    ]).completion;
  }

  public async startAsync(): Promise<void> {
    this.#initialProcess = this.#spawn(
      [path.join(__dirname, 'fixtures/SuccessfulMutationDaemon.js'), this.repoRoot, this.controlFolder],
      path.join(this.controlFolder, 'daemon.log')
    );
    const readyFile: string = path.join(this.controlFolder, 'ready.json');
    await Promise.race([
      waitForFileAsync(readyFile),
      this.#initialProcess.completion.then((result) => {
        throw new Error(`The standalone daemon exited before readiness: ${JSON.stringify(result)}`);
      })
    ]);
    const ready: { paths: IDaemonPaths; pid: number } = JSON.parse(fs.readFileSync(readyFile, 'utf8'));
    this.paths = ready.paths;
    this.initialPid = ready.pid;
  }

  public async requestAsync(args: ReadonlyArray<string>): Promise<IMutationRequestOutput> {
    const paths: IDaemonPaths | undefined = this.paths;
    if (!paths) throw new Error('The standalone daemon has not started.');
    const client: DaemonClient = await DaemonClient.connectAsync({ socketPath: paths.socketPath });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const outcome: DaemonClientOutcome = await executeWithDaemonRestartAsync(
      client,
      { paths },
      {
        request: captureDaemonRequest({
          requestId: `successful-mutation-${++this.#requestSequence}`,
          argv: args,
          commandName: args[0],
          commandOrigin: 'built-in',
          invocationKind: 'rush',
          cwd: this.repoRoot,
          environment: this.environment,
          terminal: { isTTY: false, supportsColor: false, acceptsStdin: false }
        }),
        onStdoutAsync: async (chunk) => {
          stdout.push(Buffer.from(chunk));
        },
        onStderrAsync: async (chunk) => {
          stderr.push(Buffer.from(chunk));
        }
      }
    );
    return {
      outcome,
      exitCode: outcome.kind === 'result' ? outcome.result.exitCode : undefined,
      stdout: Buffer.concat(stdout).toString(),
      stderr: Buffer.concat(stderr).toString()
    };
  }

  public async waitForSuccessorAsync(): Promise<IDaemonLockfile> {
    if (!this.paths || !this.initialPid) throw new Error('There is no original daemon ownership.');
    const { paths, initialPid } = this;
    return await waitForOwnershipAsync(paths, initialPid);
  }

  public async waitForInitialExitAsync(): Promise<ISuccessfulMutationOutput> {
    if (!this.#initialProcess) throw new Error('There is no original daemon process.');
    return await this.#initialProcess.completion;
  }

  public readAppOutput(): string {
    return fs.readFileSync(path.join(this.repoRoot, 'projects/app/lib/value.txt'), 'utf8');
  }

  public removeInstalledAppDependency(): void {
    fs.rmSync(path.join(this.repoRoot, 'projects/app/node_modules'), { recursive: true, force: true });
    fs.rmSync(path.join(this.repoRoot, 'common/temp/last-install.flag'), { force: true });
    fs.rmSync(path.join(this.repoRoot, 'common/temp/last-link.flag'), { force: true });
  }

  public selectSecondProvider(): void {
    const filename: string = path.join(this.repoRoot, 'projects/app/package.json');
    const packageJson: { dependencies: Record<string, string> } = JSON.parse(
      fs.readFileSync(filename, 'utf8')
    );
    packageJson.dependencies = { '@mutation/provider-two': 'workspace:*' };
    fs.writeFileSync(filename, JSON.stringify(packageJson));
  }

  #spawn(args: string[], logFile?: string): ITrackedProcess {
    const log: number | undefined = logFile ? fs.openSync(logFile, 'a', 0o600) : undefined;
    const child: ChildProcess = spawn(process.execPath, args, {
      cwd: this.repoRoot,
      env: this.environment,
      detached: SubprocessTerminator.RECOMMENDED_OPTIONS.detached,
      stdio: log === undefined ? ['ignore', 'pipe', 'pipe'] : ['ignore', log, log]
    });
    if (log !== undefined) fs.closeSync(log);
    SubprocessTerminator.killProcessTreeOnExit(child, SubprocessTerminator.RECOMMENDED_OPTIONS);
    let stdout: string = '';
    let stderr: string = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    const completion: Promise<ISuccessfulMutationOutput> = new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (exitCode) =>
        resolve({
          exitCode: exitCode ?? undefined,
          stdout,
          stderr: logFile ? fs.readFileSync(logFile, 'utf8') : stderr
        })
      );
    });
    const tracked: ITrackedProcess = { child, completion };
    this.#processes.add(tracked);
    return tracked;
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    const errors: unknown[] = [];
    try {
      if (this.paths) {
        try {
          const owner = readDaemonLockfile(this.paths.lockfilePath);
          await stopSuccessorAsync(this.paths);
          if (owner) await waitForTestProcessExitAsync(owner.pid);
        } catch (error) {
          errors.push(error);
        }
      }
      for (const { child, completion } of this.#processes) {
        try {
          if (child.exitCode === null && child.signalCode === null) {
            SubprocessTerminator.killProcessTree(child, SubprocessTerminator.RECOMMENDED_OPTIONS);
          }
          await completion;
          if (child.pid !== undefined) await waitForTestProcessExitAsync(child.pid);
        } catch (error) {
          errors.push(error);
        }
      }
    } finally {
      if (errors.length === 0) fs.rmSync(this.folder, { recursive: true, force: true });
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, `Failed to clean up native mutation fixtures; retained ${this.folder}.`);
    }
  }
}

function waitForFileAsync(filename: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout: NodeJS.Timeout = setTimeout(
      () => finish(new Error(`Timed out waiting for ${filename}`)),
      20_000
    );
    const watcher: fs.FSWatcher = fs.watch(path.dirname(filename), inspect);
    function finish(error?: Error): void {
      clearTimeout(timeout);
      watcher.close();
      if (error) reject(error);
      else resolve();
    }
    function inspect(): void {
      if (fs.existsSync(filename)) finish();
    }
    watcher.once('error', finish);
    inspect();
  });
}

function waitForOwnershipAsync(paths: IDaemonPaths, oldPid: number): Promise<IDaemonLockfile> {
  return new Promise((resolve, reject) => {
    const timeout: NodeJS.Timeout = setTimeout(
      () => finish(undefined, new Error('No successor acquired ownership.')),
      20_000
    );
    const watcher: fs.FSWatcher = fs.watch(path.dirname(paths.lockfilePath), inspect);
    function finish(owner?: IDaemonLockfile, error?: Error): void {
      clearTimeout(timeout);
      watcher.close();
      if (error) reject(error);
      else if (owner) resolve(owner);
    }
    function inspect(): void {
      const owner: IDaemonLockfile | undefined = readDaemonLockfile(paths.lockfilePath);
      if (owner && owner.pid !== oldPid) finish(owner);
    }
    watcher.once('error', (error) => finish(undefined, error));
    inspect();
  });
}
