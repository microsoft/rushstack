// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';

import { Rush, RushUserConfiguration, type ITelemetryData } from '@microsoft/rush-lib';
import {
  DaemonFrameType,
  decodeDaemonLogChunk,
  type IDaemonRequestEnvelope
} from '@rushstack/rush-daemon-protocol';
import type { LockFile } from '@rushstack/node-core-library';

import { ProductionDaemonRequestResolver } from '../ProductionDaemonRequestResolver';
import { RushDaemonHost } from '../RushDaemonHost';
import { WorkspaceSession } from '../WorkspaceSession';
import { removeTestFolderAsync } from './TestProcessExit';
import { trackTestDaemonHostAsync } from './TestDaemonHostCleanup';
import type { GetWorkspaceSuccessorLaunchAsync } from '../WorkspaceProcessRestart';
import type {
  IDaemonRequestResolver,
  IResolveDaemonRequestOptions,
  ResolvedDaemonRequest
} from '../DaemonRequestDispatcher';
import {
  isRushxInvocation,
  wrapWorkspaceResolverLifecycle,
  type IWorkspaceResolverLifecycle
} from '../WorkspaceResolverLifecycle';
import {
  DaemonRequestWireClient,
  createWireEnvelope,
  type ITerminalExchange
} from './DaemonRequestWireTestUtilities';

const RUSH_VERSION: string = Rush.version;

export interface IFixture extends AsyncDisposable {
  readonly repoRoot: string;
  readonly host: RushDaemonHost;
  readonly session: WorkspaceSession;
  readonly client: DaemonRequestWireClient;
}

export interface IFixtureOptions {
  readonly getSuccessorLaunchAsync?: GetWorkspaceSuccessorLaunchAsync;
  readonly onSessionCreated?: (session: WorkspaceSession) => void;
  readonly resolver?: IDaemonRequestResolver;
  /** Adds the `_phase:compile:incremental` script, which passes `--incremental` to build.cjs. */
  readonly incrementalScript?: boolean;
  /** Sets `daemon.incrementalBuilds` in rush.json. */
  readonly incrementalBuilds?: boolean;
  /** Adds the phased `test` (incremental) and `retest` commands, with a `_phase:test`, and a global `hello`. */
  readonly customCommands?: boolean;
  /** Adds a preRushBuild event hook, which only build and rebuild run. */
  readonly buildEventHook?: boolean;
  /** Uses PNPM, which installs a dependency file (shrinkwrap-deps.json) that change detection hashes per project. */
  readonly pnpm?: boolean;
  readonly telemetryEnabled?: boolean;
  /** Sets `daemon.compatiblePlugins` in rush.json. */
  readonly compatiblePlugins?: ReadonlyArray<string>;
  /** Sets `daemon.deferCacheWrites` in rush.json. */
  readonly deferCacheWrites?: boolean;
}

/** Records the admission class of every phased request that a production resolver, or its replacement, resolves. */
export class ClassRecordingResolver extends ProductionDaemonRequestResolver {
  readonly #classes: string[];

  public constructor(
    classes: string[],
    options?: ConstructorParameters<typeof ProductionDaemonRequestResolver>[0]
  ) {
    super(options);
    this.#classes = classes;
  }

  public override createForSession(
    preparationLock?: LockFile,
    validateGraphInputsAsync?: () => Promise<void>
  ): ProductionDaemonRequestResolver {
    return new ClassRecordingResolver(this.#classes, { preparationLock, validateGraphInputsAsync });
  }

  public override async resolveRequestAsync(
    options: IResolveDaemonRequestOptions
  ): Promise<ResolvedDaemonRequest> {
    const resolved: ResolvedDaemonRequest = await super.resolveRequestAsync(options);
    if (resolved.kind === 'phased') {
      this.#classes.push(`${resolved.request.commandName}:${resolved.exclusivityClass}`);
    }
    return resolved;
  }
}

export class DecoratedTestResolver implements IDaemonRequestResolver {
  public readonly workspaceLifecycle: IWorkspaceResolverLifecycle | undefined;
  private readonly _inner: IDaemonRequestResolver;
  private readonly _events: string[];
  private readonly _id: number;
  private _disposed: boolean = false;

  public constructor(inner: IDaemonRequestResolver, events: string[]) {
    this._inner = inner;
    this._events = events;
    this._id = events.filter((event) => event.startsWith('created')).length;
    events.push(`created:${this._id}`);
    this.workspaceLifecycle = wrapWorkspaceResolverLifecycle(
      inner,
      (replacement) => new DecoratedTestResolver(replacement, events)
    );
  }

  public async resolveRequestAsync(options: IResolveDaemonRequestOptions): Promise<ResolvedDaemonRequest> {
    if (this._disposed) throw new Error('A disposed resolver was invoked.');
    if (isRushxInvocation(options.envelope)) {
      this._events.push(`isolated:${this._id}`);
      throw new Error('Explicit isolated invocation reached the decorated resolver.');
    }
    return await this._inner.resolveRequestAsync(options);
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    if (this._disposed) throw new Error('A resolver was disposed twice.');
    this._disposed = true;
    this._events.push(`disposed:${this._id}`);
    await this._inner[Symbol.asyncDispose]?.();
  }
}

/** Creates a Git repository with the projects a, b and c (b depends on a), and a daemon host that serves it. */
export async function createFixtureAsync(
  cache: boolean = false,
  configurationKind: 'direct' | 'rig' | 'inherited' = 'direct',
  options: IFixtureOptions = {}
): Promise<IFixture> {
  const repoRoot: string = fs.mkdtempSync(
    path.join(fs.realpathSync.native(os.tmpdir()), 'rushd-native-engine-')
  );
  const cacheNamespace: string = path.basename(repoRoot);
  const userConfiguration: RushUserConfiguration = await RushUserConfiguration.initializeAsync();
  const cacheFolder: string = path.join(
    userConfiguration.buildCacheFolder ?? path.join(repoRoot, 'common/temp/build-cache'),
    cacheNamespace
  );
  const write: (name: string, text: string) => void = (name, text) => {
    const filename: string = path.join(repoRoot, name);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, text);
  };
  write(
    'rush.json',
    JSON.stringify({
      rushVersion: RUSH_VERSION,
      ...(options.pnpm ? { pnpmVersion: '9.15.9' } : { npmVersion: '10.0.0' }),
      // Retention assertions must not depend on the surrounding Jest worker's accumulated RSS.
      daemon: {
        warmMemoryBudgetMB: 100_000,
        ...(options.incrementalBuilds === undefined ? {} : { incrementalBuilds: options.incrementalBuilds }),
        ...(options.compatiblePlugins === undefined ? {} : { compatiblePlugins: options.compatiblePlugins }),
        ...(options.deferCacheWrites === undefined ? {} : { deferCacheWrites: options.deferCacheWrites })
      },
      ...(options.buildEventHook ? { eventHooks: { preRushBuild: ['node -e ""'] } } : {}),
      ...(options.telemetryEnabled ? { telemetryEnabled: true } : {}),
      projectFolderMinDepth: 2,
      projectFolderMaxDepth: 2,
      projects: ['a', 'b', 'c'].map((name) => ({
        packageName: name,
        projectFolder: `projects/${name}`
      }))
    })
  );
  write('.gitignore', 'common/temp/\n**/.rush/\n**/rush-logs/\n**/lib/\n**/node_modules/\nruns.txt\n');
  write('common/temp/last-link.flag', '{}');
  if (options.pnpm) {
    write('common/config/rush/pnpm-lock.yaml', "lockfileVersion: '9.0'\n");
  } else {
    write('common/config/rush/npm-shrinkwrap.json', '{"lockfileVersion":3,"packages":{}}');
  }
  write(
    'common/config/rush/command-line.json',
    JSON.stringify({
      phases: [
        { name: '_phase:compile', dependencies: { upstream: ['_phase:compile'] } },
        ...(options.customCommands
          ? [{ name: '_phase:test', dependencies: { self: ['_phase:compile'] } }]
          : [])
      ],
      commands: [
        {
          commandKind: 'phased',
          name: 'build',
          phases: ['_phase:compile'],
          incremental: true,
          enableParallelism: true
        },
        ...(options.customCommands
          ? [
              {
                commandKind: 'phased',
                name: 'test',
                summary: 'Builds and tests',
                phases: ['_phase:compile', '_phase:test'],
                incremental: true,
                enableParallelism: true
              },
              {
                commandKind: 'phased',
                name: 'retest',
                summary: 'Rebuilds and tests',
                phases: ['_phase:compile', '_phase:test'],
                incremental: false,
                enableParallelism: true
              },
              {
                commandKind: 'global',
                name: 'hello',
                summary: 'A global command',
                shellCommand: 'node -e ""'
              }
            ]
          : [])
      ],
      parameters: [
        {
          parameterKind: 'flag',
          longName: '--production',
          description: 'Production build',
          associatedCommands: ['build'],
          associatedPhases: ['_phase:compile']
        }
      ]
    })
  );
  if (cache) {
    write(
      'common/config/rush/build-cache.json',
      JSON.stringify({
        buildCacheEnabled: true,
        cacheProvider: 'local-only',
        cacheEntryNamePattern: `${cacheNamespace}/[hash]`
      })
    );
  }
  for (const name of ['a', 'b', 'c']) {
    write(
      `projects/${name}/package.json`,
      JSON.stringify({
        name,
        version: '1.0.0',
        scripts: {
          '_phase:compile': 'node build.cjs',
          ...(options.incrementalScript
            ? { '_phase:compile:incremental': 'node build.cjs --incremental' }
            : {}),
          ...(options.customCommands ? { '_phase:test': 'node test.cjs' } : {})
        },
        dependencies: name === 'b' ? { a: '1.0.0' } : {}
      })
    );
    write(
      `projects/${name}/config/rush-project.json`,
      JSON.stringify({
        operationSettings: [{ operationName: '_phase:compile', outputFolderNames: ['lib'] }]
      })
    );
    write(`projects/${name}/input.txt`, 'one');
    if (options.pnpm) write(`projects/${name}/.rush/temp/shrinkwrap-deps.json`, '{}');
    write(
      `projects/${name}/test.cjs`,
      `require('node:fs').appendFileSync('../../runs.txt', 'test-${name}\\n');\n`
    );
    write(
      `projects/${name}/build.cjs`,
      `
const fs = require('node:fs');
const path = require('node:path');
const name = require('./package.json').name;
const input = fs.readFileSync(fs.existsSync('src/input.txt') ? 'src/input.txt' : 'input.txt', 'utf8');
(async () => {
const gateFile = path.resolve('../../common/temp/gate-' + name + '.json');
if (fs.existsSync(gateFile)) {
  const { port } = JSON.parse(fs.readFileSync(gateFile, 'utf8'));
  await new Promise((resolve, reject) => {
    const socket = require('node:net').connect(port, '127.0.0.1');
    socket.once('error', reject);
    socket.once('data', () => { socket.end(); resolve(); });
  });
}
fs.appendFileSync('../../runs.txt', name + ':' + input + ':' + process.argv.slice(2).join(' ') + '\\n');
const environmentFile = path.resolve('../../common/temp/operation-environment.txt');
if (fs.existsSync(environmentFile)) {
  const { COPILOT_AGENT_SESSION_ID = null, RUSH_INVOKED_FOLDER = null } = process.env;
  fs.appendFileSync(environmentFile, JSON.stringify([name, COPILOT_AGENT_SESSION_ID, RUSH_INVOKED_FOLDER]) + '\\n');
}
fs.mkdirSync('lib', { recursive: true });
fs.writeFileSync('lib/output.txt', input);
console.log('built-' + name + '-' + input);
if (input === 'warning') console.error('warning-' + name);
if (input === 'failure') process.exitCode = 7;
})().catch((error) => { console.error(error); process.exitCode = 1; });
`
    );
  }
  if (configurationKind === 'rig') {
    fs.rmSync(path.join(repoRoot, 'projects/a/config/rush-project.json'));
    write('projects/a/config/rig.json', '{"rigPackageName":"fixture-rig"}');
    write('projects/a/node_modules/fixture-rig/package.json', '{"name":"fixture-rig","version":"1.0.0"}');
    write(
      'projects/a/node_modules/fixture-rig/profiles/default/config/rush-project.json',
      JSON.stringify({
        operationSettings: [{ operationName: '_phase:compile', outputFolderNames: ['lib'] }]
      })
    );
  } else if (configurationKind === 'inherited') {
    write(
      'common/temp/inherited-rush-project.json',
      JSON.stringify({
        operationSettings: [{ operationName: '_phase:compile', outputFolderNames: ['lib'] }]
      })
    );
    write(
      'projects/a/config/rush-project.json',
      JSON.stringify({
        extends: '../../../common/temp/inherited-rush-project.json',
        incrementalBuildIgnoredGlobs: ['ignored.txt']
      })
    );
  }
  execFileSync('git', ['init', '--quiet'], { cwd: repoRoot });
  execFileSync('git', ['config', '--local', 'core.autocrlf', 'false'], { cwd: repoRoot });
  execFileSync('git', ['add', '.'], { cwd: repoRoot });
  execFileSync(
    'git',
    [
      // Don't start a detached `git maintenance` that could still be writing into .git during cleanup
      '-c',
      'maintenance.auto=false',
      '-c',
      'user.name=Engine Test',
      '-c',
      'user.email=engine@example.invalid',
      'commit',
      '--quiet',
      '-m',
      'fixture'
    ],
    { cwd: repoRoot }
  );
  let session: WorkspaceSession | undefined;
  let host: RushDaemonHost | undefined;
  try {
    host = await RushDaemonHost.startAsync({
      repoRoot,
      rushVersion: RUSH_VERSION,
      daemonVersion: 'native-engine-test',
      requestResolver: options.resolver ?? new ProductionDaemonRequestResolver(),
      getSuccessorLaunchAsync: options.getSuccessorLaunchAsync,
      createWorkspaceSessionAsync: async (sessionOptions) => {
        session = await WorkspaceSession.createAsync(sessionOptions);
        options.onSessionCreated?.(session);
        return session;
      }
    });
    await trackTestDaemonHostAsync(host);
    const client: DaemonRequestWireClient = await DaemonRequestWireClient.connectAsync(host.paths.socketPath);
    await client.handshakeAsync();
    const runningHost: RushDaemonHost = host;
    return {
      repoRoot,
      host,
      get session(): WorkspaceSession {
        return session!;
      },
      client,
      [Symbol.asyncDispose]: async () => {
        await client.closeAsync().finally(() => runningHost.closeAsync());
        if (cache) await removeTestFolderAsync(cacheFolder, true);
        await removeTestFolderAsync(repoRoot, true);
      }
    };
  } catch (error) {
    await host?.closeAsync();
    if (cache) await removeTestFolderAsync(cacheFolder, true);
    await removeTestFolderAsync(repoRoot, true);
    throw error;
  }
}

export async function runAsync(
  fixture: IFixture,
  requestId: string,
  argv: string[],
  overrides: Partial<IDaemonRequestEnvelope> = {}
): Promise<ITerminalExchange> {
  const environment: Record<string, string> = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (value !== undefined) environment[name] = value;
  }
  await fixture.client.sendControlAsync({
    kind: 'requestStart',
    payload: createWireEnvelope(requestId, argv[0], fixture.repoRoot, {
      argv,
      environment,
      commandOrigin: 'built-in',
      ...overrides
    })
  });
  return await fixture.client.readTerminalAsync(requestId);
}

export function runs(fixture: IFixture): string[] {
  const filename: string = path.join(fixture.repoRoot, 'runs.txt');
  return fs.existsSync(filename) ? fs.readFileSync(filename, 'utf8').trim().split('\n') : [];
}

export function logText(exchange: ITerminalExchange): string {
  return exchange.frames
    .filter((frame) => frame.kind === DaemonFrameType.logStdout || frame.kind === DaemonFrameType.logStderr)
    .map((frame) => Buffer.from(decodeDaemonLogChunk(frame.payload).chunk).toString())
    .join('');
}

export function requestEnvironment(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)
  );
}

export function readTelemetryEntries(repoRoot: string): ITelemetryData[] {
  const folder: string = path.join(repoRoot, 'common/temp/telemetry');
  return fs
    .readdirSync(folder)
    .sort()
    .flatMap((name: string) => JSON.parse(fs.readFileSync(path.join(folder, name), 'utf8')));
}
