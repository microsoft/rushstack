// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Readable } from 'node:stream';

import { Rush } from '@microsoft/rush-lib';
import {
  DaemonClient,
  captureDaemonRequest,
  type DaemonClientOutcome,
  type IDaemonClientExecuteOptions
} from '@rushstack/rush-client-core';
import {
  ProductionDaemonRequestResolver,
  RushDaemonHost,
  RushDaemonRequestResolver,
  WorkspaceSession
} from '@rushstack/rush-daemon';
import type { IDaemonRequestEnvelope } from '@rushstack/rush-daemon-protocol';

export interface IScriptResult {
  readonly exitCode: number | undefined;
  readonly stdout: Buffer;
  readonly stderr: Buffer;
}

export interface IRequestResult extends IScriptResult {
  readonly outcome: DaemonClientOutcome;
}

export class RushXDaemonTestFixture implements AsyncDisposable {
  public readonly folder: string = fs.mkdtempSync(path.join(os.tmpdir(), 'rushx-daemon-'));
  public readonly home: string = path.join(this.folder, 'home');
  public readonly phasedResolver: ProductionDaemonRequestResolver = new ProductionDaemonRequestResolver();
  public readonly errors: Error[] = [];
  public host!: RushDaemonHost;
  public session!: WorkspaceSession;

  public constructor(hooks: boolean = false, pnpmSync: boolean = false) {
    this.write('rush.json', JSON.stringify({
      rushVersion: Rush.version,
      suppressNodeLtsWarning: true,
      pnpmVersion: '10.27.0',
      projectFolderMinDepth: 2,
      projectFolderMaxDepth: 2,
      daemon: { enabled: true, autoStart: false },
      eventHooks: hooks ? { preRushx: ['node hook.cjs'], postRushx: ['node hook.cjs'] } : {},
      projects: ['a', 'b'].map((name) => ({ packageName: name, projectFolder: `projects/${name}` }))
    }));
    this.write('hook.cjs', "require('node:fs').appendFileSync('hooks.txt', 'hook\\n');");
    this.write('common/config/rush/experiments.json', JSON.stringify({
      usePnpmSyncForInjectedDependencies: pnpmSync
    }));
    this.write('home/.rush-user/.env', 'USER_VALUE=from-user\nORDER=from-user\n');
    this.write('.env', 'REPO_VALUE=from-repo\nORDER=from-repo\nCLIENT_VALUE=from-repo\n');
    for (const name of ['a', 'b', 'unregistered']) {
      this.write(`projects/${name}/package.json`, JSON.stringify({
        name, version: '1.0.0',
        scripts: {
          build: 'node script.cjs',
          args: 'node args.cjs',
          pipe: 'node pipe.cjs',
          fail: 'node fail.cjs',
          early: 'node early.cjs',
          tree: 'node tree.cjs',
          sync: 'node sync.cjs',
          daemon: 'node args.cjs'
        }
      }));
      this.write(`projects/${name}/subfolder/keep.txt`, '');
      this.write(`projects/${name}/script.cjs`, `
const fs = require('node:fs');
const path = require('node:path');
fs.appendFileSync('runs.txt', 'ran\\n');
console.log(JSON.stringify({
  name: require('./package.json').name, cwd: process.cwd(),
  invoked: process.env.RUSH_INVOKED_FOLDER, init: process.env.INIT_CWD,
  bin: process.env.PATH.split(path.delimiter)[0], marker: process.env.CLIENT_MARKER,
  repo: process.env.REPO_VALUE, user: process.env.USER_VALUE,
  order: process.env.ORDER, client: process.env.CLIENT_VALUE,
  recursive: process.env._RUSH_RECURSIVE_RUSHX_CALL,
  npmConfig: process.env.NPM_CONFIG_TEST,
  absent: process.env.RUSHD_PARENT_ONLY
}));
`);
      this.write(`projects/${name}/args.cjs`, 'process.stdout.write(JSON.stringify(process.argv.slice(2)));');
      this.write(`projects/${name}/pipe.cjs`, `
process.stderr.write(Buffer.from([255, 0, 3, 10]));
process.stdin.pipe(process.stdout);
`);
      this.write(`projects/${name}/fail.cjs`,
        "process.stdout.write('raw-out'); process.stderr.write('raw-err'); process.exitCode = 7;");
      this.write(`projects/${name}/early.cjs`, 'process.exitCode = 23;');
      this.write(`projects/${name}/sync.cjs`, "require('node:fs').writeFileSync('output.txt', 'new-content');");
      this.write(`projects/${name}/tree.cjs`, `
const { spawn } = require('node:child_process');
spawn(process.execPath, ['-e', "console.log('DESCENDANT:' + process.pid); setInterval(() => {}, 1000);"],
  { stdio: ['ignore', 'inherit', 'inherit'] });
console.log('PARENT:' + process.pid);
setInterval(() => {}, 1000);
`);
    }
  }

  public async startAsync(): Promise<void> {
    const { version }: { version: string } = require('@rushstack/rush-daemon/package.json');
    this.host = await RushDaemonHost.startAsync({
      repoRoot: this.folder,
      rushVersion: Rush.version,
      daemonVersion: version,
      requestResolver: new RushDaemonRequestResolver(this.phasedResolver),
      onError: (error) => { this.errors.push(error); },
      createWorkspaceSessionAsync: async (options) => {
        this.session = await WorkspaceSession.createAsync(options);
        return this.session;
      }
    });
  }

  public write(filename: string, content: string): void {
    const fullPath: string = path.join(this.folder, filename);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }

  public environment(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
    return {
      ...process.env, HOME: this.home, USERPROFILE: this.home,
      CLIENT_MARKER: 'client', CLIENT_VALUE: 'from-client',
      NPM_CONFIG_TEST: 'discard-me', INIT_CWD: 'discard-me',
      RUSHD_PARENT_ONLY: undefined, FORCE_COLOR: '0', NO_COLOR: undefined,
      _RUSH_RECURSIVE_RUSHX_CALL: undefined,
      RUSH_DAEMON: '1', RUSH_DAEMON_AUTO_START: '0',
      CI: 'false', TF_BUILD: 'false', GITHUB_ACTIONS: 'false',
      ...overrides
    };
  }

  public request(argv: string[], cwd: string, environment: NodeJS.ProcessEnv = this.environment()): IDaemonRequestEnvelope {
    return captureDaemonRequest({
      argv, commandName: argv.find((arg) => !arg.startsWith('-'))!,
      commandOrigin: 'custom', invocationKind: 'rushx', cwd, environment,
      terminal: { isTTY: false, supportsColor: false, acceptsStdin: true }
    });
  }

  public async runAsync(
    request: IDaemonRequestEnvelope,
    input: Buffer = Buffer.alloc(0),
    overrides: Partial<IDaemonClientExecuteOptions> = {}
  ): Promise<IRequestResult> {
    const client: DaemonClient = await DaemonClient.connectAsync({ socketPath: this.host.paths.socketPath });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const outcome: DaemonClientOutcome = await client.executeAsync({
      request, stdin: Readable.from([input]), requiresStdinEnd: true,
      onStdoutAsync: async (bytes) => { stdout.push(Buffer.from(bytes)); },
      onStderrAsync: async (bytes) => { stderr.push(Buffer.from(bytes)); },
      ...overrides
    });
    return {
      outcome, exitCode: outcome.kind === 'result' ? outcome.result.exitCode : undefined,
      stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr)
    };
  }

  public invokeAsync(
    native: boolean,
    argv: string[],
    cwd: string,
    environment: NodeJS.ProcessEnv = this.environment(),
    input: Buffer = Buffer.alloc(0)
  ): Promise<IScriptResult> {
    const entry: string = native
      ? path.join(path.dirname(require.resolve('@microsoft/rush/package.json')), 'bin/rushx')
      : path.resolve(__dirname, '../../bin/rushx-client');
    const child: ChildProcess = spawn(process.execPath, [entry, ...argv], {
      cwd, env: environment, stdio: 'pipe'
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout!.on('data', (bytes: Buffer) => stdout.push(bytes));
    child.stderr!.on('data', (bytes: Buffer) => stderr.push(bytes));
    child.stdin!.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code !== 'EPIPE') throw error;
    });
    child.stdin!.end(input);
    return new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (exitCode) => resolve({
        exitCode: exitCode ?? undefined, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr)
      }));
    });
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    await this.host?.closeAsync();
    fs.rmSync(this.folder, { recursive: true, force: true });
  }
}
