// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';

import {
  PhasedCommandEngine,
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

import { ProductionDaemonRequestResolver } from '../ProductionDaemonRequestResolver';
import { RushDaemonHost } from '../RushDaemonHost';
import { WorkspaceSession } from '../WorkspaceSession';
import { EngineTerminalProvider } from '../EngineTerminalProvider';
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

const RUSH_VERSION: string = '5.179.0';
jest.setTimeout(30_000);

interface IFixture extends AsyncDisposable {
  readonly repoRoot: string;
  readonly host: RushDaemonHost;
  readonly session: WorkspaceSession;
  readonly client: DaemonRequestWireClient;
}

async function createFixtureAsync(
  cache: boolean = false,
  configurationKind: 'direct' | 'rig' | 'inherited' = 'direct'
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
      requestResolver: new ProductionDaemonRequestResolver(),
      createWorkspaceSessionAsync: async (options) => {
        session = await WorkspaceSession.createAsync(options);
        return session;
      }
    });
    const client: DaemonRequestWireClient = await DaemonRequestWireClient.connectAsync(host.paths.socketPath);
    await client.handshakeAsync();
    const runningHost: RushDaemonHost = host;
    return {
      repoRoot,
      host,
      session: session!,
      client,
      [Symbol.asyncDispose]: async () => {
        try {
          await client.closeAsync();
        } finally {
          try {
            await runningHost.closeAsync();
          } finally {
            if (cache) fs.rmSync(cacheFolder, { recursive: true, force: true });
            fs.rmSync(repoRoot, { recursive: true, force: true });
          }
        }
      }
    };
  } catch (error) {
    await host?.closeAsync();
    if (cache) fs.rmSync(cacheFolder, { recursive: true, force: true });
    fs.rmSync(repoRoot, { recursive: true, force: true });
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

describe('native production daemon engine', () => {
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
    it(`uses real ${kind} configuration and native cache, and rejects unwatched configuration changes`, async () => {
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
        expect(
          (await runAsync(fixture, 'configuration-changed', ['build', '--only', 'a'])).terminal
        ).toMatchObject({
          kind: 'requestRejected',
          payload: { code: 'workspaceRecreationRequired' }
        });
        expect(runs(fixture)).toHaveLength(2);
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
        (candidate) => candidate.associatedProject === project
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

  it('does not expand unsafe --only selection and rejects incompatible parameters, environment and ambiguous rushx', async () => {
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
      expect((await runAsync(fixture, 'parameters', ['build', '--only', 'b'])).terminal).toMatchObject({
        kind: 'requestRejected'
      });
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
      expect(runs(fixture)).toHaveLength(1);
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

  it('runs rebuild scripts on every request and refuses changed graph definitions', async () => {
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
      expect(
        (await runAsync(fixture, 'changed-definition', ['rebuild', '--only', 'a'])).terminal.kind
      ).not.toBe('requestResult');
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
