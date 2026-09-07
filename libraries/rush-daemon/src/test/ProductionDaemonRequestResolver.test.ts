// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';

import {
  PhasedCommandEngine,
  Rush,
  RushProjectConfiguration,
  RushUserConfiguration,
  type IOperationGraph,
  type Operation,
  type OperationEnabledState,
  type RushConfigurationProject
} from '@microsoft/rush-lib';
import {
  DaemonFrameType,
  decodeDaemonEventFrame,
  decodeDaemonLogChunk,
  type IDaemonPhasedRequestResult,
  type IDaemonRequestEnvelope
} from '@rushstack/rush-daemon-protocol';
import { NoOpTerminalProvider, Terminal, TerminalProviderSeverity } from '@rushstack/terminal';
import { StandardScriptUpdater } from '@microsoft/rush-lib/lib/logic/StandardScriptUpdater';
import { RushConfiguration as InternalRushConfiguration } from '@microsoft/rush-lib/lib/api/RushConfiguration';

import { ProductionDaemonRequestResolver } from '../ProductionDaemonRequestResolver';
import { RushDaemonHost } from '../RushDaemonHost';
import { WorkspaceSession } from '../WorkspaceSession';
import { stopSuccessorAsync } from './WorkspaceLifecycleTestProcess';
import { removeTestFolderAsync } from './TestProcessExit';
import { readDaemonLockfile } from '@rushstack/rush-daemon-transport';
import { EngineTerminalProvider } from '../EngineTerminalProvider';
import { getInstalledWorkspaceSuccessorLaunchAsync } from '../WorkspaceProcessRestart';
import type {
  GetWorkspaceSuccessorLaunchAsync,
  IWorkspaceProcessRestartResult
} from '../WorkspaceProcessRestart';
import type { IResolveDaemonRequestOptions, ResolvedDaemonRequest } from '../DaemonRequestDispatcher';
import type { IDaemonRequestResolver } from '../DaemonRequestDispatcher';
import {
  isRushxInvocation,
  wrapWorkspaceResolverLifecycle,
  type IWorkspaceResolverLifecycle
} from '../WorkspaceResolverLifecycle';
import { PhasedRequestRouter } from '../PhasedRequestRouter';
import { TestPhasedRequestClient } from './PhasedRequestRouterTestUtilities';
import {
  createNativeScriptGateAsync,
  runNativeCommandAsync,
  type INativeCommandResult,
  type INativeScriptGate
} from './NativeEngineTestCommands';
import {
  DaemonRequestWireClient,
  createDeferred,
  createWireEnvelope,
  type IDeferred,
  type ITerminalExchange
} from './DaemonRequestWireTestUtilities';

const RUSH_VERSION: string = Rush.version;
jest.setTimeout(30_000);

interface IFixture extends AsyncDisposable {
  readonly repoRoot: string;
  readonly host: RushDaemonHost;
  readonly session: WorkspaceSession;
  readonly client: DaemonRequestWireClient;
}

interface IFixtureOptions {
  readonly getSuccessorLaunchAsync?: GetWorkspaceSuccessorLaunchAsync;
  readonly onSessionCreated?: (session: WorkspaceSession) => void;
  readonly resolver?: IDaemonRequestResolver;
}

class DecoratedTestResolver implements IDaemonRequestResolver {
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

async function createFixtureAsync(
  cache: boolean = false,
  configurationKind: 'direct' | 'rig' | 'inherited' = 'direct',
  options: IFixtureOptions = {}
): Promise<IFixture> {
  const repoRoot: string = fs.mkdtempSync(path.join(os.tmpdir(), 'rushd-native-engine-'));
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
      npmVersion: '10.0.0',
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
  write('common/config/rush/npm-shrinkwrap.json', '{"lockfileVersion":3,"packages":{}}');
  write(
    'common/config/rush/command-line.json',
    JSON.stringify({
      phases: [{ name: '_phase:compile', dependencies: { upstream: ['_phase:compile'] } }],
      commands: [
        {
          commandKind: 'phased',
          name: 'build',
          phases: ['_phase:compile'],
          incremental: true,
          enableParallelism: true
        }
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
        scripts: { '_phase:compile': 'node build.cjs' },
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
    write(
      `projects/${name}/build.cjs`,
      `
const fs = require('node:fs');
const path = require('node:path');
const name = require('./package.json').name;
const input = fs.readFileSync('input.txt', 'utf8');
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
  execFileSync('git', ['add', '.'], { cwd: repoRoot });
  execFileSync(
    'git',
    [
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

async function runAsync(
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

function runs(fixture: IFixture): string[] {
  const filename: string = path.join(fixture.repoRoot, 'runs.txt');
  return fs.existsSync(filename) ? fs.readFileSync(filename, 'utf8').trim().split('\n') : [];
}

function logText(exchange: ITerminalExchange): string {
  return exchange.frames
    .filter((frame) => frame.kind === DaemonFrameType.logStdout || frame.kind === DaemonFrameType.logStderr)
    .map((frame) => Buffer.from(decodeDaemonLogChunk(frame.payload).chunk).toString())
    .join('');
}

function requestEnvironment(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)
  );
}

describe('native production daemon engine', () => {
  it('preserves resolver decoration and isolated invocation routing across native generation reloads', async () => {
    const events: string[] = [];
    const fixture: IFixture = await createFixtureAsync(false, 'direct', {
      resolver: new DecoratedTestResolver(new ProductionDaemonRequestResolver(), events)
    });
    try {
      expect((await runAsync(fixture, 'initial-decorated', ['build', '--only', 'a'])).terminal).toMatchObject(
        {
          kind: 'requestResult',
          payload: { exitCode: 0 }
        }
      );
      const graph: IOperationGraph | undefined = fixture.session.operationGraph;
      const filename: string = path.join(fixture.repoRoot, 'projects/a/package.json');
      const json: { scripts: Record<string, string> } = JSON.parse(fs.readFileSync(filename, 'utf8'));
      json.scripts['_phase:compile'] = 'node build.cjs --decorated-reload';
      fs.writeFileSync(filename, JSON.stringify(json));
      expect(
        (await runAsync(fixture, 'reloaded-decorated', ['build', '--only', 'a'])).terminal
      ).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0 }
      });
      expect(fixture.session.operationGraph).not.toBe(graph);
      const isolated: { invocationKind: 'rushx'; commandOrigin: 'built-in' } = {
        invocationKind: 'rushx',
        commandOrigin: 'built-in'
      };
      expect(
        (await runAsync(fixture, 'isolated-decorated', ['daemon', 'graph', 'show'], isolated)).terminal
      ).toMatchObject({
        kind: 'requestRejected',
        payload: { message: 'Explicit isolated invocation reached the decorated resolver.' }
      });
      expect(events).toEqual([
        'created:0',
        'created:1',
        'disposed:0',
        'created:2',
        'disposed:1',
        'isolated:2'
      ]);
      expect(runs(fixture)).toEqual(['a:one:', 'a:one:--decorated-reload']);
    } finally {
      await fixture[Symbol.asyncDispose]();
    }
    expect(events.at(-1)).toBe('disposed:2');
  });

  it('keeps tier0 session and graph identity for unchanged content, including metadata touches', async () => {
    const fixture: IFixture = await createFixtureAsync();
    try {
      await runAsync(fixture, 'initial', ['build', '--only', 'a']);
      const session: WorkspaceSession = fixture.session;
      const graph: IOperationGraph | undefined = session.operationGraph;
      const filename: string = path.join(fixture.repoRoot, 'projects/a/config/rush-project.json');
      fs.writeFileSync(filename, fs.readFileSync(filename));
      expect((await runAsync(fixture, 'unchanged', ['build', '--only', 'a'])).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0, scheduled: false }
      });
      expect(fixture.session).toBe(session);
      expect(fixture.session.operationGraph).toBe(graph);
      expect(runs(fixture)).toEqual(['a:one:']);
    } finally {
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('keeps the selected native SDK handoff instead of restarting for a foreign client engine path', async () => {
    const fixture: IFixture = await createFixtureAsync();
    try {
      await runAsync(fixture, 'initial-sdk', ['build', '--only', 'a']);
      const graph: IOperationGraph | undefined = fixture.session.operationGraph;
      const environment: Record<string, string> = {
        ...requestEnvironment(),
        _RUSH_LIB_PATH: path.join(fixture.repoRoot, 'foreign-client-engine.js')
      };
      expect((await runAsync(fixture, 'foreign-sdk', ['build', '--only', 'a'], { environment })).terminal)
        .toMatchObject({ kind: 'requestResult', payload: { exitCode: 0, scheduled: false } });
      expect(fixture.session.operationGraph).toBe(graph);
      expect(environment._RUSH_LIB_PATH).toBe(path.join(fixture.repoRoot, 'foreign-client-engine.js'));
      expect(runs(fixture)).toEqual(['a:one:']);
    } finally {
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('replaces configuration and command shape in-process without using a disposed generation', async () => {
    const fixture: IFixture = await createFixtureAsync();
    try {
      await runAsync(fixture, 'initial', ['build', '--only', 'a']);
      const first: WorkspaceSession = fixture.session;
      const firstGraph: IOperationGraph = first.operationGraph!;
      const firstGeneration: number = fixture.host.workspaceGeneration;
      const packageFile: string = path.join(fixture.repoRoot, 'projects/a/package.json');
      const packageJson: { scripts: Record<string, string> } = JSON.parse(
        fs.readFileSync(packageFile, 'utf8')
      );
      packageJson.scripts['_phase:compile'] = 'node build.cjs --new-definition';
      fs.writeFileSync(packageFile, JSON.stringify(packageJson));
      expect((await runAsync(fixture, 'configuration', ['build', '--only', 'a'])).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0 }
      });
      expect(fixture.session).not.toBe(first);
      expect(fixture.session.operationGraph).not.toBe(firstGraph);
      expect(firstGraph.abortController.signal.aborted).toBe(true);
      await expect(first.acquireExecutionLeaseAsync()).rejects.toThrow('disposed');
      expect(fixture.host.workspaceGeneration).toBeGreaterThan(firstGeneration);
      expect(readDaemonLockfile(fixture.host.paths.lockfilePath)?.pid).toBe(process.pid);
      const second: WorkspaceSession = fixture.session;
      expect((await runAsync(fixture, 'shape', ['rebuild', '--only', 'a'])).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0 }
      });
      expect(fixture.session).not.toBe(second);
      expect(runs(fixture)).toEqual(['a:one:', 'a:one:--new-definition', 'a:one:--new-definition']);
    } finally {
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('never executes an old resolved graph after a racing configuration reload', async () => {
    const fixture: IFixture = await createFixtureAsync();
    const entered: IDeferred<void> = createDeferred();
    const release: IDeferred<void> = createDeferred();
    let second: DaemonRequestWireClient | undefined;
    let oldRequest: Promise<ITerminalExchange> | undefined;
    let newRequest: Promise<ITerminalExchange> | undefined;
    let delayed: boolean = false;
    try {
      await runAsync(fixture, 'initial', ['build', '--only', 'a']);
      const oldSession: WorkspaceSession = fixture.session;
      const resolveAsync: ProductionDaemonRequestResolver['resolveRequestAsync'] =
        ProductionDaemonRequestResolver.prototype.resolveRequestAsync;
      jest
        .spyOn(ProductionDaemonRequestResolver.prototype, 'resolveRequestAsync')
        .mockImplementation(async function (
          this: ProductionDaemonRequestResolver,
          options: IResolveDaemonRequestOptions
        ) {
          const resolved: ResolvedDaemonRequest = await resolveAsync.call(this, options);
          if (options.envelope.requestId === 'old' && !delayed) {
            delayed = true;
            entered.resolve();
            await release.promise;
          }
          return resolved;
        });
      oldRequest = runAsync(fixture, 'old', ['build', '--only', 'a']);
      await entered.promise;
      const packageFile: string = path.join(fixture.repoRoot, 'projects/a/package.json');
      const packageJson: { scripts: Record<string, string> } = JSON.parse(
        fs.readFileSync(packageFile, 'utf8')
      );
      packageJson.scripts['_phase:compile'] = 'node build.cjs --raced-definition';
      fs.writeFileSync(packageFile, JSON.stringify(packageJson));
      second = await DaemonRequestWireClient.connectAsync(fixture.host.paths.socketPath);
      await second.handshakeAsync();
      await second.sendControlAsync({
        kind: 'requestStart',
        payload: createWireEnvelope('new', 'build', fixture.repoRoot, {
          commandOrigin: 'built-in',
          argv: ['build', '--only', 'a'],
          environment: requestEnvironment()
        })
      });
      expect((await second.readControlAsync()).kind).toBe('queuePosition');
      newRequest = second.readTerminalAsync('new');
      expect(oldSession.operationGraph!.abortController.signal.aborted).toBe(false);
      release.resolve();
      for (const result of await Promise.all([oldRequest, newRequest])) {
        expect(result.terminal).toMatchObject({ kind: 'requestResult', payload: { exitCode: 0 } });
      }
      expect(oldSession.operationGraph!.abortController.signal.aborted).toBe(true);
      expect(runs(fixture)).toEqual(['a:one:', 'a:one:--raced-definition']);
    } finally {
      release.resolve();
      await oldRequest;
      await newRequest;
      jest.restoreAllMocks();
      await second?.closeAsync();
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('drains typed pre-execution results for accepted queued clients before hard restart closes them', async () => {
    const selecting: IDeferred<void> = createDeferred();
    const release: IDeferred<void> = createDeferred();
    const fixture: IFixture = await createFixtureAsync(false, 'direct', {
      getSuccessorLaunchAsync: async (context) => {
        selecting.resolve();
        await release.promise;
        return await getInstalledWorkspaceSuccessorLaunchAsync(context);
      }
    });
    let second: DaemonRequestWireClient | undefined;
    let firstResult: Promise<ITerminalExchange> | undefined;
    let secondResult: Promise<ITerminalExchange> | undefined;
    try {
      await runAsync(fixture, 'initialize-before-restart', ['build', '--only', 'a']);
      const environment: Record<string, string> = { ...requestEnvironment(), RUSHD_TEST_INPUT: 'changed' };
      second = await DaemonRequestWireClient.connectAsync(fixture.host.paths.socketPath);
      await second.handshakeAsync();
      firstResult = runAsync(fixture, 'restart-initiator', ['build', '--only', 'a'], { environment });
      await selecting.promise;
      await second.sendControlAsync({
        kind: 'requestStart',
        payload: createWireEnvelope('queued-for-restart', 'build', fixture.repoRoot, {
          argv: ['build', '--only', 'a'], commandOrigin: 'built-in', environment
        })
      });
      expect((await second.readControlAsync()).kind).toBe('queuePosition');
      secondResult = second.readTerminalAsync('queued-for-restart');
      release.resolve();
      for (const result of await Promise.all([firstResult, secondResult])) {
        expect(result.terminal).toMatchObject({
          kind: 'requestResult', payload: { exitCode: 1, retryAfterRestart: true }
        });
        expect(result.frames.every((frame) => frame.kind === DaemonFrameType.controlJson)).toBe(true);
      }
      expect((await fixture.host.restartCompleted)?.pid).not.toBe(process.pid);
      expect(runs(fixture)).toEqual(['a:one:']);
    } finally {
      release.resolve();
      await firstResult;
      await secondResult;
      await second?.closeAsync();
      await fixture.host.restartCompleted;
      await stopSuccessorAsync(fixture.host.paths);
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('restarts a hard environment change in a new process without replaying the triggering request', async () => {
    const fixture: IFixture = await createFixtureAsync(false, 'direct', {
      getSuccessorLaunchAsync: getInstalledWorkspaceSuccessorLaunchAsync
    });
    let successor: DaemonRequestWireClient | undefined;
    try {
      await runAsync(fixture, 'initial', ['build', '--only', 'a']);
      const oldGraph: IOperationGraph = fixture.session.operationGraph!;
      const environment: Record<string, string> = {
        ...requestEnvironment(),
        RUSH_PARALLELISM: process.env.RUSH_PARALLELISM === '1' ? '2' : '1'
      };
      expect(
        (await runAsync(fixture, 'hard', ['build', '--only', 'a'], { environment })).terminal
      ).toMatchObject({
        kind: 'requestResult',
        payload: {
          exitCode: 1,
          errorMessage: expect.stringContaining('No operation was scheduled or executed')
        }
      });
      const restarted: IWorkspaceProcessRestartResult | undefined = await fixture.host.restartCompleted;
      expect(restarted?.pid).not.toBe(process.pid);
      expect(restarted?.pid).toBe(readDaemonLockfile(fixture.host.paths.lockfilePath)?.pid);
      expect(oldGraph.abortController.signal.aborted).toBe(true);
      expect(runs(fixture)).toEqual(['a:one:']);
      successor = await DaemonRequestWireClient.connectAsync(fixture.host.paths.socketPath);
      await successor.handshakeAsync();
      expect(
        (
          await runAsync({ ...fixture, client: successor }, 'explicit-next', ['build', '--only', 'a'], {
            environment
          })
        ).terminal
      ).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0 }
      });
    } finally {
      await successor?.closeAsync();
      await stopSuccessorAsync(fixture.host.paths);
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('refuses an unavailable selected Rush version without executing the current engine as that version', async () => {
    const fixture: IFixture = await createFixtureAsync(false, 'direct', {
      getSuccessorLaunchAsync: getInstalledWorkspaceSuccessorLaunchAsync
    });
    try {
      await runAsync(fixture, 'initial', ['build', '--only', 'a']);
      const filename: string = path.join(fixture.repoRoot, 'rush.json');
      const json: { rushVersion: string } = JSON.parse(fs.readFileSync(filename, 'utf8'));
      json.rushVersion = '5.999.0';
      fs.writeFileSync(filename, JSON.stringify(json));
      expect(
        (await runAsync(fixture, 'unsupported-version', ['build', '--only', 'a'])).terminal
      ).toMatchObject({
        kind: 'requestRejected',
        payload: { message: expect.stringContaining('Cannot launch selected Rush 5.999.0') }
      });
      expect(runs(fixture)).toEqual(['a:one:']);
      expect(readDaemonLockfile(fixture.host.paths.lockfilePath)?.pid).toBe(process.pid);
    } finally {
      await fixture[Symbol.asyncDispose]();
    }
  });

  for (const commandName of ['install', 'update']) {
    it(`drains the real ${commandName} worker result before cleanup and successor startup, including partial failure`, async () => {
      const resultReceived: IDeferred<void> = createDeferred();
      const disposalEntered: IDeferred<void> = createDeferred();
      const allowDisposal: IDeferred<void> = createDeferred();
      const fixture: IFixture = await createFixtureAsync(false, 'direct', {
        getSuccessorLaunchAsync: getInstalledWorkspaceSuccessorLaunchAsync,
        onSessionCreated: (session) => {
          const dispose: () => Promise<void> = session[Symbol.asyncDispose].bind(session);
          jest.spyOn(session, Symbol.asyncDispose).mockImplementation(async () => {
            if (session.operationGraph) {
              disposalEntered.resolve();
              await resultReceived.promise;
              await allowDisposal.promise;
            }
            await dispose();
          });
        }
      });
      let successor: DaemonRequestWireClient | undefined;
      try {
        await runAsync(fixture, 'initial', ['build', '--only', 'a']);
        await StandardScriptUpdater.updateAsync(
          InternalRushConfiguration.loadFromConfigurationFile(path.join(fixture.repoRoot, 'rush.json'))
        );
        const oldGraph: IOperationGraph = fixture.session.operationGraph!;
        const scriptPath: string = path.join(fixture.repoRoot, 'common/temp/mutate.cjs');
        fs.writeFileSync(
          scriptPath,
          `
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const file = path.join(root, 'projects/a/package.json');
const json = JSON.parse(fs.readFileSync(file, 'utf8'));
json.scripts['_phase:compile'] = 'node build.cjs --post-mutation';
fs.writeFileSync(file, JSON.stringify(json));
fs.appendFileSync(path.join(root, 'common/temp/mutation-count.txt'), 'once\\n');
console.log('native-mutation-applied');
process.exit(23);
`
        );
        const rushJsonPath: string = path.join(fixture.repoRoot, 'rush.json');
        const json: { eventHooks?: object } = JSON.parse(fs.readFileSync(rushJsonPath, 'utf8'));
        json.eventHooks = { preRushInstall: ['node common/temp/mutate.cjs'] };
        fs.writeFileSync(rushJsonPath, JSON.stringify(json));
        const result: ITerminalExchange = await runAsync(fixture, 'mutation', [
          commandName,
          '--bypass-policy',
          '--max-install-attempts',
          '0'
        ]);
        expect(result.terminal).toMatchObject({
          kind: 'requestResult',
          payload: { exitCode: 1, outcome: 'failure', aborted: false }
        });
        resultReceived.resolve();
        await disposalEntered.promise;
        expect(oldGraph.abortController.signal.aborted).toBe(false);
        expect(readDaemonLockfile(fixture.host.paths.lockfilePath)?.pid).toBe(process.pid);
        allowDisposal.resolve();
        const restarted: IWorkspaceProcessRestartResult | undefined = await fixture.host.restartCompleted;
        expect(restarted?.pid).not.toBe(process.pid);
        expect(oldGraph.abortController.signal.aborted).toBe(true);
        successor = await DaemonRequestWireClient.connectAsync(fixture.host.paths.socketPath);
        await successor.handshakeAsync();
        expect(
          (await runAsync({ ...fixture, client: successor }, 'post-mutation', ['build', '--only', 'a']))
            .terminal
        ).toMatchObject({
          kind: 'requestResult',
          payload: { exitCode: 0 }
        });
        expect(runs(fixture)).toEqual(['a:one:', 'a:one:--post-mutation']);
        expect(fs.readFileSync(path.join(fixture.repoRoot, 'common/temp/mutation-count.txt'), 'utf8')).toBe(
          'once\n'
        );
      } finally {
        resultReceived.resolve();
        allowDisposal.resolve();
        await successor?.closeAsync();
        await stopSuccessorAsync(fixture.host.paths);
        await fixture[Symbol.asyncDispose]();
        jest.restoreAllMocks();
      }
    });
  }

  it('releases the lock before reporting an idle result so a real native Rush action can run', async () => {
    const fixture: IFixture = await createFixtureAsync();
    try {
      expect((await runAsync(fixture, 'warm', ['build', '--only', 'a'])).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0 }
      });

      const graph: IOperationGraph | undefined = fixture.session.operationGraph;
      const native: INativeCommandResult = await runNativeCommandAsync(fixture.repoRoot, [
        'rebuild',
        '--only',
        'a',
        '--parallelism',
        '3',
        '--verbose'
      ]);
      expect(native).toMatchObject({ exitCode: 0 });
      expect(native.stdout).toContain('built-a-one');
      expect(runs(fixture)).toEqual(['a:one:', 'a:one:']);
      expect((await runAsync(fixture, 'after-native', ['build', '--only', 'a'])).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0 }
      });
      expect(fixture.session.operationGraph).toBe(graph);
    } finally {
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('refuses native lock contention at preparation and at iteration time, and accepts a later explicit retry', async () => {
    const fixture: IFixture = await createFixtureAsync();
    const gate: INativeScriptGate = await createNativeScriptGateAsync(fixture.repoRoot, 'a');
    let native: Promise<INativeCommandResult> | undefined;
    try {
      native = runNativeCommandAsync(fixture.repoRoot, ['rebuild', '--only', 'a', '--parallelism', '3']);
      await Promise.race([
        gate.entered,
        native.then((result) => {
          throw new Error(`Native action did not enter its script gate: ${JSON.stringify(result)}`);
        })
      ]);
      expect(
        (await runAsync(fixture, 'busy-initialization', ['build', '--only', 'b'])).terminal
      ).toMatchObject({
        kind: 'requestRejected',
        payload: { message: expect.stringContaining('Another Rush command') }
      });
      expect(fixture.session.operationGraph).toBeUndefined();
      await gate.releaseAsync();
      expect(await native).toMatchObject({ exitCode: 0 });
      expect((await runAsync(fixture, 'retry', ['build', '--only', 'b'])).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0 }
      });
      const secondGate: INativeScriptGate = await createNativeScriptGateAsync(fixture.repoRoot, 'a');
      try {
        native = runNativeCommandAsync(fixture.repoRoot, ['rebuild', '--only', 'a', '--parallelism', '3']);
        await Promise.race([
          secondGate.entered,
          native.then((result) => {
            throw new Error(`Native action did not enter its script gate: ${JSON.stringify(result)}`);
          })
        ]);
        expect((await runAsync(fixture, 'busy-iteration', ['build', '--only', 'b'])).terminal).toMatchObject({
          kind: 'requestRejected',
          payload: { message: expect.stringContaining('Another Rush command') }
        });
      } finally {
        await secondGate.releaseAsync();
        await native;
      }
      expect((await runAsync(fixture, 'retry-iteration', ['build', '--only', 'b'])).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0 }
      });
    } finally {
      await gate.releaseAsync();
      await native;
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('uses one native lease for a merged batch and excludes native actions throughout reconciliation and execution', async () => {
    const fixture: IFixture = await createFixtureAsync();
    const reconcileEntered: IDeferred<void> = createDeferred();
    const releaseReconciliation: IDeferred<void> = createDeferred();
    const secondSelection: IDeferred<void> = createDeferred();
    let secondClient: DaemonRequestWireClient | undefined;
    let gate: INativeScriptGate | undefined;
    let first: Promise<ITerminalExchange> | undefined;
    let second: Promise<ITerminalExchange> | undefined;
    try {
      await runAsync(fixture, 'initialize', ['build', '--only', 'c']);
      // Count the batch's lease independently of optional idle-maintenance leases.
      await fixture.session.quiesceWarmSetAsync();
      const graph: IOperationGraph = fixture.session.operationGraph!;
      const scheduleSpy: jest.SpyInstance = jest.spyOn(graph, 'scheduleIterationAsync');
      const leaseSpy: jest.SpyInstance = jest.spyOn(fixture.session, 'acquireExecutionLeaseAsync');
      const reconcileAsync: WorkspaceSession['reconcileInvalidationsAsync'] =
        fixture.session.reconcileInvalidationsAsync.bind(fixture.session);
      jest.spyOn(fixture.session, 'reconcileInvalidationsAsync').mockImplementationOnce(async () => {
        reconcileEntered.resolve();
        await releaseReconciliation.promise;
        return await reconcileAsync();
      });
      const selectAsync: PhasedCommandEngine['selectOperationsAsync'] =
        PhasedCommandEngine.prototype.selectOperationsAsync;
      let selections: number = 0;
      jest.spyOn(PhasedCommandEngine.prototype, 'selectOperationsAsync').mockImplementation(async function (
        this: PhasedCommandEngine,
        selectedGraph: IOperationGraph
      ) {
        const selection: ReadonlyMap<Operation, OperationEnabledState> = await selectAsync.call(
          this,
          selectedGraph
        );
        if (++selections === 2) secondSelection.resolve();
        return selection;
      });
      gate = await createNativeScriptGateAsync(fixture.repoRoot, 'a');
      secondClient = await DaemonRequestWireClient.connectAsync(fixture.host.paths.socketPath);
      await secondClient.handshakeAsync();
      first = runAsync(fixture, 'dependency', ['build', '--to', 'a']);
      await reconcileEntered.promise;
      second = runAsync({ ...fixture, client: secondClient }, 'consumer', ['build', '--to', 'b']);
      await secondSelection.promise;
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(await runNativeCommandAsync(fixture.repoRoot, ['rebuild', '--only', 'c'])).toMatchObject({
        exitCode: 1,
        stdout: expect.stringContaining('Another Rush command')
      });
      releaseReconciliation.resolve();
      await Promise.race([
        gate.entered,
        first.then((result) => {
          throw new Error(
            `Daemon iteration did not enter its script gate: ${JSON.stringify(result.terminal)}`
          );
        })
      ]);
      expect(await runNativeCommandAsync(fixture.repoRoot, ['rebuild', '--only', 'c'])).toMatchObject({
        exitCode: 1,
        stdout: expect.stringContaining('Another Rush command')
      });
      await gate.releaseAsync();
      const results: ITerminalExchange[] = await Promise.all([first, second]);
      for (const result of results)
        expect(result.terminal).toMatchObject({
          kind: 'requestResult',
          payload: { exitCode: 0 }
        });
      expect(leaseSpy).toHaveBeenCalledTimes(1);
      expect(scheduleSpy).toHaveBeenCalledTimes(1);
      expect(runs(fixture)).toEqual(['c:one:', 'a:one:', 'b:one:']);
    } finally {
      releaseReconciliation.resolve();
      await gate?.releaseAsync();
      await first;
      await second;
      jest.restoreAllMocks();
      await secondClient?.closeAsync();
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('holds the native lease until operation output has drained, before publishing the terminal result', async () => {
    const fixture: IFixture = await createFixtureAsync();
    const outputStarted: IDeferred<void> = createDeferred();
    const releaseOutput: IDeferred<void> = createDeferred();
    const iterationFinished: IDeferred<void> = createDeferred();
    let request: Promise<IDaemonPhasedRequestResult> | undefined;
    try {
      await runAsync(fixture, 'initialize', ['build', '--only', 'c']);
      fixture.session.operationGraph!.hooks.afterExecuteIterationAsync.tap(
        { name: 'test iteration completed', stage: Infinity },
        (status) => {
          iterationFinished.resolve();
          return status;
        }
      );
      const client: TestPhasedRequestClient = new TestPhasedRequestClient();
      client.onWriteAsync = async (write) => {
        if (write.operationId && write.text) {
          outputStarted.resolve();
          await releaseOutput.promise;
        }
      };
      request = new PhasedRequestRouter(fixture.session).executeAsync(
        {
          commandName: 'build',
          commandOrigin: 'built-in',
          requestId: 'output-drain',
          environment: {},
          engineShape: fixture.session.engineShape!,
          operationSelection: [{ operationId: 'a (compile)', enabledState: true }]
        },
        client,
        true
      );
      await outputStarted.promise;
      await iterationFinished.promise;
      expect(await runNativeCommandAsync(fixture.repoRoot, ['rebuild', '--only', 'c'])).toMatchObject({
        exitCode: 1
      });
      releaseOutput.resolve();
      expect(await request).toMatchObject({ exitCode: 0 });
      expect(await runNativeCommandAsync(fixture.repoRoot, ['rebuild', '--only', 'c'])).toMatchObject({
        exitCode: 0
      });
    } finally {
      releaseOutput.resolve();
      await request;
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('awaits an outstanding execution lease before disposing the engine', async () => {
    const fixture: IFixture = await createFixtureAsync();
    let lease: AsyncDisposable | undefined;
    let disposal: Promise<void> | undefined;
    try {
      await runAsync(fixture, 'initialize', ['build', '--only', 'a']);
      lease = await fixture.session.acquireExecutionLeaseAsync();
      let disposed: boolean = false;
      disposal = fixture.session[Symbol.asyncDispose]().then(() => {
        disposed = true;
      });
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(disposed).toBe(false);
      await expect(fixture.session.acquireExecutionLeaseAsync()).rejects.toThrow('disposed');
      await lease![Symbol.asyncDispose]();
      await disposal;
      expect(disposed).toBe(true);
      expect(fixture.session.operationGraph!.abortController.signal.aborted).toBe(true);
    } finally {
      await lease?.[Symbol.asyncDispose]();
      await disposal;
      await fixture[Symbol.asyncDispose]();
    }
  });

  for (const kind of ['rig', 'inherited'] as const) {
    it(`uses real ${kind} configuration and native cache, and reloads unwatched configuration changes`, async () => {
      const fixture: IFixture = await createFixtureAsync(true, kind);
      try {
        const initial: ITerminalExchange = await runAsync(fixture, 'initial', ['build', '--only', 'a']);
        expect(initial.terminal).toMatchObject({ kind: 'requestResult', payload: { exitCode: 0 } });
        expect(logText(initial)).toContain('Successfully set cache entry');
        expect((await runAsync(fixture, 'warm', ['build', '--only', 'a'])).terminal).toMatchObject({
          kind: 'requestResult',
          payload: { exitCode: 0, scheduled: false }
        });
        fs.writeFileSync(path.join(fixture.repoRoot, 'projects/a/input.txt'), 'two');
        await runAsync(fixture, 'changed', ['build', '--only', 'a']);
        fs.writeFileSync(path.join(fixture.repoRoot, 'projects/a/input.txt'), 'one');
        expect((await runAsync(fixture, 'cached', ['build', '--only', 'a'])).terminal).toMatchObject({
          kind: 'requestResult',
          payload: { exitCode: 0, operationResults: [{ status: 'FROM CACHE' }] }
        });
        expect(runs(fixture)).toEqual(['a:one:', 'a:two:']);
        const configurationFile: string =
          kind === 'rig'
            ? path.join(
                fixture.repoRoot,
                'projects/a/node_modules/fixture-rig/profiles/default/config/rush-project.json'
              )
            : path.join(fixture.repoRoot, 'common/temp/inherited-rush-project.json');
        fs.writeFileSync(
          configurationFile,
          JSON.stringify({
            operationSettings: [
              {
                operationName: '_phase:compile',
                outputFolderNames: ['lib'],
                disableBuildCacheForOperation: true
              }
            ]
          })
        );
        const oldGraph: IOperationGraph | undefined = fixture.session.operationGraph;
        expect(
          (await runAsync(fixture, 'configuration-changed', ['build', '--only', 'a'])).terminal
        ).toMatchObject({
          kind: 'requestResult',
          payload: { exitCode: 0 }
        });
        expect(fixture.session.operationGraph).not.toBe(oldGraph);
        expect(runs(fixture)).toHaveLength(3);
      } finally {
        await fixture[Symbol.asyncDispose]();
      }
    });
  }

  it('constructs the engine from fresh rig data without clearing or modifying native configuration caches', async () => {
    const fixture: IFixture = await createFixtureAsync(true, 'rig');
    try {
      const project: RushConfigurationProject = fixture.session.rushConfiguration.projectsByName.get('a')!;
      const terminal: Terminal = new Terminal(new NoOpTerminalProvider());
      const cached: RushProjectConfiguration | undefined =
        await RushProjectConfiguration.tryLoadForProjectAsync(project, terminal);
      fs.writeFileSync(
        path.join(
          fixture.repoRoot,
          'projects/a/node_modules/fixture-rig/profiles/default/config/rush-project.json'
        ),
        JSON.stringify({
          operationSettings: [
            {
              operationName: '_phase:compile',
              outputFolderNames: ['lib'],
              disableBuildCacheForOperation: true
            }
          ]
        })
      );
      expect((await runAsync(fixture, 'fresh-engine', ['build', '--only', 'a'])).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0 }
      });
      const operation: Operation | undefined = Array.from(fixture.session.operationGraph!.operations).find(
        (candidate) => candidate.associatedProject.packageName === project.packageName
      );
      expect(operation!.settings!.disableBuildCacheForOperation).toBe(true);
      expect(await RushProjectConfiguration.tryLoadForProjectAsync(project, terminal)).toBe(cached);
      expect(
        cached!.operationSettingsByOperationName.get('_phase:compile')!.disableBuildCacheForOperation
      ).toBeUndefined();
    } finally {
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('uses fresh inherited ignore globs for native git selectors without changing shared caches', async () => {
    const fixture: IFixture = await createFixtureAsync(false, 'rig');
    try {
      const project: RushConfigurationProject = fixture.session.rushConfiguration.projectsByName.get('a')!;
      const configurationFile: string = path.join(
        fixture.repoRoot,
        'projects/a/node_modules/fixture-rig/profiles/default/config/rush-project.json'
      );
      const settings: object = {
        operationSettings: [{ operationName: '_phase:compile', outputFolderNames: ['lib'] }]
      };
      fs.writeFileSync(
        configurationFile,
        JSON.stringify({ ...settings, incrementalBuildIgnoredGlobs: ['input.txt'] })
      );
      const terminal: Terminal = new Terminal(new NoOpTerminalProvider());
      const cached: RushProjectConfiguration | undefined =
        await RushProjectConfiguration.tryLoadForProjectAsync(project, terminal);
      fs.writeFileSync(configurationFile, JSON.stringify(settings));
      fs.writeFileSync(path.join(project.projectFolder, 'input.txt'), 'git-selection');
      execFileSync('git', ['add', 'projects/a/input.txt'], { cwd: fixture.repoRoot });
      const selected: ITerminalExchange = await runAsync(fixture, 'git-selection', [
        'build',
        '--only',
        'git:HEAD'
      ]);
      expect(selected.terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0, operationResults: [{ operationId: 'a (compile)' }] }
      });
      expect(runs(fixture)).toEqual(['a:git-selection:']);
      expect(await RushProjectConfiguration.tryLoadForProjectAsync(project, terminal)).toBe(cached);
      expect(Array.from(cached!.incrementalBuildIgnoredGlobs)).toEqual(['input.txt']);
    } finally {
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('executes real selected scripts, reuses one all-project graph, refreshes inputs and closes it', async () => {
    const fixture: IFixture = await createFixtureAsync();
    const originalEnvironment: NodeJS.ProcessEnv = { ...process.env };
    const originalCwd: string = process.cwd();
    let graph: IOperationGraph | undefined;
    try {
      const first: ITerminalExchange = await runAsync(fixture, 'initial', [
        'build',
        '--to',
        'b',
        '--parallelism',
        '3'
      ]);
      expect(first.terminal).toMatchObject({
        kind: 'requestResult',
        payload: {
          exitCode: 0,
          scheduled: true,
          operationResults: [
            { operationId: 'a (compile)', status: 'SUCCESS' },
            { operationId: 'b (compile)', status: 'SUCCESS' }
          ]
        }
      });
      expect(logText(first)).toContain('built-a-one');
      expect(runs(fixture)).toEqual(['a:one:', 'b:one:']);
      graph = fixture.session.operationGraph;
      expect(graph?.operations.size).toBe(3);

      const warm: ITerminalExchange = await runAsync(fixture, 'warm', [
        'build',
        '--to',
        'b',
        '--parallelism',
        '3'
      ]);
      expect(warm.terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0, scheduled: false }
      });
      expect(fixture.session.operationGraph).toBe(graph);
      expect(runs(fixture)).toHaveLength(2);

      fs.writeFileSync(path.join(fixture.repoRoot, 'projects/a/input.txt'), 'two');
      const changed: ITerminalExchange = await runAsync(fixture, 'changed', [
        'build',
        '--to',
        'b',
        '--parallelism',
        '3'
      ]);
      expect(changed.terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0, scheduled: true }
      });
      expect(runs(fixture)).toEqual(['a:one:', 'b:one:', 'a:two:', 'b:one:']);

      const selected: ITerminalExchange = await runAsync(
        fixture,
        'cwd-selection',
        ['build', '--only', '.', '--parallelism', '3'],
        {
          cwd: path.join(fixture.repoRoot, 'projects/c')
        }
      );
      expect(selected.terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0, operationResults: [{ operationId: 'c (compile)' }] }
      });
      expect(runs(fixture).at(-1)).toBe('c:one:');
      expect(fixture.session.operationGraph).toBe(graph);
      expect(process.cwd()).toBe(originalCwd);
      expect(process.env).toEqual(originalEnvironment);
    } finally {
      await fixture[Symbol.asyncDispose]();
    }
    expect(graph?.abortController.signal.aborted).toBe(true);
    await expect(fixture.session.reconcileInvalidationsAsync()).rejects.toThrow('disposed');
  });

  it('does not expand unsafe --only selection and reloads changed parameters while rejecting ambiguous rushx', async () => {
    const fixture: IFixture = await createFixtureAsync();
    try {
      const first: ITerminalExchange = await runAsync(fixture, 'only', [
        'build',
        '--only',
        'b',
        '--production'
      ]);
      expect(first.terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0, operationResults: [{ operationId: 'b (compile)' }] }
      });
      expect(runs(fixture)).toEqual(['b:one:--production']);
      const originalGraph: IOperationGraph | undefined = fixture.session.operationGraph;
      expect((await runAsync(fixture, 'parameters', ['build', '--only', 'b'])).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0 }
      });
      expect(fixture.session.operationGraph).not.toBe(originalGraph);
      expect(
        (
          await runAsync(fixture, 'environment', ['build', '--only', 'b', '--production'], {
            environment: {}
          })
        ).terminal
      ).toMatchObject({ kind: 'requestRejected' });
      expect(
        (await runAsync(fixture, 'rushx', ['build'], { commandOrigin: 'custom' })).terminal
      ).toMatchObject({ kind: 'requestRejected' });
      expect(runs(fixture)).toEqual(['b:one:--production', 'b:one:']);
    } finally {
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('preserves warnings-as-errors and failed script results', async () => {
    const fixture: IFixture = await createFixtureAsync();
    try {
      fs.writeFileSync(path.join(fixture.repoRoot, 'projects/a/input.txt'), 'warning');
      const warning: ITerminalExchange = await runAsync(fixture, 'warning', ['build', '--only', 'a']);
      expect(warning.terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 1, outcome: 'success-with-warning' }
      });
      expect(logText(warning)).toContain('warning-a');
      fs.writeFileSync(path.join(fixture.repoRoot, 'projects/a/input.txt'), 'failure');
      const failed: ITerminalExchange = await runAsync(fixture, 'failed', ['build', '--only', 'a']);
      expect(failed.terminal).toMatchObject({
        kind: 'requestResult',
        payload: {
          exitCode: 1,
          outcome: 'failure',
          operationResults: [{ operationId: 'a (compile)', status: 'FAILURE' }]
        }
      });
      expect(await runNativeCommandAsync(fixture.repoRoot, ['rebuild', '--only', 'c'])).toMatchObject({
        exitCode: 0
      });
    } finally {
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('rechecks installation state under the execution lease and releases the lock when reconciliation fails', async () => {
    const fixture: IFixture = await createFixtureAsync();
    try {
      await runAsync(fixture, 'initialize', ['build', '--only', 'a']);
      const flagPath: string = path.join(fixture.repoRoot, 'common/temp/last-link.flag');
      fs.rmSync(flagPath);
      expect((await runAsync(fixture, 'unlinked', ['build', '--only', 'a'])).terminal).toMatchObject({
        kind: 'requestRejected',
        payload: { message: expect.stringContaining('Link flag invalid') }
      });
      expect(runs(fixture)).toEqual(['a:one:']);
      fs.writeFileSync(flagPath, '{}');
      expect(await runNativeCommandAsync(fixture.repoRoot, ['rebuild', '--only', 'c'])).toMatchObject({
        exitCode: 0
      });
    } finally {
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('runs rebuild scripts on every request and reloads changed graph definitions', async () => {
    const fixture: IFixture = await createFixtureAsync();
    try {
      for (const id of ['rebuild-one', 'rebuild-two']) {
        expect((await runAsync(fixture, id, ['rebuild', '--only', 'a'])).terminal).toMatchObject({
          kind: 'requestResult',
          payload: { exitCode: 0, scheduled: true }
        });
      }
      expect(runs(fixture)).toEqual(['a:one:', 'a:one:']);
      fs.writeFileSync(
        path.join(fixture.repoRoot, 'projects/a/package.json'),
        '{"name":"a","version":"1.0.0","scripts":{"_phase:compile":"echo wrong"}}'
      );
      const oldGraph: IOperationGraph | undefined = fixture.session.operationGraph;
      expect(
        (await runAsync(fixture, 'changed-definition', ['rebuild', '--only', 'a'])).terminal
      ).toMatchObject({ kind: 'requestResult', payload: { exitCode: 0 } });
      expect(fixture.session.operationGraph).not.toBe(oldGraph);
      expect(runs(fixture)).toHaveLength(2);
    } finally {
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('uses the native local build cache instead of executing a previously cached input again', async () => {
    const fixture: IFixture = await createFixtureAsync(true);
    try {
      expect((await runAsync(fixture, 'cache-one', ['build', '--only', 'a'])).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0 }
      });
      fs.writeFileSync(path.join(fixture.repoRoot, 'projects/a/input.txt'), 'two');
      expect((await runAsync(fixture, 'cache-two', ['build', '--only', 'a'])).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0 }
      });
      fs.writeFileSync(path.join(fixture.repoRoot, 'projects/a/input.txt'), 'one');
      const cached: ITerminalExchange = await runAsync(fixture, 'cache-restore', ['build', '--only', 'a']);
      expect(cached.terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0, operationResults: [{ operationId: 'a (compile)', status: 'FROM CACHE' }] }
      });
      expect(runs(fixture)).toEqual(['a:one:', 'a:two:']);
      expect(fs.readFileSync(path.join(fixture.repoRoot, 'projects/a/lib/output.txt'), 'utf8')).toBe('one');
    } finally {
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('reconciles changes made without a connected client and preserves an empty native selection', async () => {
    const fixture: IFixture = await createFixtureAsync();
    let reconnected: DaemonRequestWireClient | undefined;
    try {
      expect((await runAsync(fixture, 'initial', ['build', '--to', 'b'])).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0 }
      });
      const graph: IOperationGraph | undefined = fixture.session.operationGraph;
      await fixture.client.closeAsync();
      fs.writeFileSync(path.join(fixture.repoRoot, 'projects/a/input.txt'), 'offline-change');
      reconnected = await DaemonRequestWireClient.connectAsync(fixture.host.paths.socketPath);
      await reconnected.handshakeAsync();
      const next: IFixture = { ...fixture, client: reconnected };
      expect((await runAsync(next, 'reconnected', ['build', '--to', 'b'])).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0, scheduled: true }
      });
      expect(fixture.session.operationGraph).toBe(graph);
      expect(runs(fixture)).toEqual(['a:one:', 'b:one:', 'a:offline-change:', 'b:one:']);
      expect((await runAsync(next, 'empty', ['build', '--to-except', 'a'])).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0, scheduled: false, operationResults: [] }
      });
      expect(runs(fixture)).toHaveLength(4);
    } finally {
      await reconnected?.closeAsync();
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('awaits runner cleanup before shutdown completes and does not close twice on abort', async () => {
    const fixture: IFixture = await createFixtureAsync();
    const releaseCleanup: IDeferred<void> = createDeferred();
    const cleanupStarted: IDeferred<void> = createDeferred();
    let shutdown: Promise<void> | undefined;
    try {
      expect((await runAsync(fixture, 'initial', ['build', '--only', 'a'])).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0 }
      });
      const graph: IOperationGraph = fixture.session.operationGraph!;
      const closeRunnersAsync: () => Promise<void> = graph.closeRunnersAsync.bind(graph);
      const closeSpy: jest.SpyInstance<Promise<void>, [operations?: Iterable<Operation>]> = jest
        .spyOn(graph, 'closeRunnersAsync')
        .mockImplementation(async () => {
          cleanupStarted.resolve();
          await releaseCleanup.promise;
          await closeRunnersAsync();
        });
      let closed: boolean = false;
      shutdown = fixture.host.closeAsync().then(() => {
        closed = true;
      });
      await cleanupStarted.promise;
      expect(closed).toBe(false);
      releaseCleanup.resolve();
      await shutdown;
      expect(closed).toBe(true);
      expect(graph.abortController.signal.aborted).toBe(true);
      expect(closeSpy).toHaveBeenCalledTimes(1);
    } finally {
      releaseCleanup.resolve();
      await shutdown;
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('rejects invalid inherited project configuration before creating a graph or running scripts', async () => {
    const fixture: IFixture = await createFixtureAsync();
    try {
      fs.writeFileSync(
        path.join(fixture.repoRoot, 'projects/a/config/rush-project.json'),
        '{"extends":"./unowned.json"}'
      );
      expect((await runAsync(fixture, 'unsupported', ['build'])).terminal).toMatchObject({
        kind: 'requestRejected'
      });
      expect(fixture.session.operationGraph).toBeUndefined();
      expect(runs(fixture)).toEqual([]);
    } finally {
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('delivers buffered engine diagnostics even when the warm request schedules no work', async () => {
    const fixture: IFixture = await createFixtureAsync();
    try {
      await runAsync(fixture, 'initial', ['build', '--only', 'a']);
      const terminal: EngineTerminalProvider = new EngineTerminalProvider();
      terminal.attach(fixture.session.operationGraph!);
      terminal.write('snapshot-diagnostic', TerminalProviderSeverity.warning);
      const warm: ITerminalExchange = await runAsync(fixture, 'warm', ['build', '--only', 'a']);
      expect(warm.terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0, scheduled: false }
      });
      const events: string = warm.frames
        .filter((frame) => frame.kind === DaemonFrameType.event)
        .map((frame) => JSON.stringify(decodeDaemonEventFrame(frame.payload)))
        .join('\n');
      expect(events).toContain('snapshot-diagnostic');
      expect(runs(fixture)).toEqual(['a:one:']);
    } finally {
      await fixture[Symbol.asyncDispose]();
    }
  });
});
