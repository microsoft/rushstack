// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';

import { RushUserConfiguration, type IOperationGraph, type Operation } from '@microsoft/rush-lib';
import {
  DaemonFrameType,
  decodeDaemonEventFrame,
  decodeDaemonLogChunk,
  type IDaemonRequestEnvelope
} from '@rushstack/rush-daemon-protocol';
import { TerminalProviderSeverity } from '@rushstack/terminal';

import { ProductionDaemonRequestResolver } from '../ProductionDaemonRequestResolver';
import { RushDaemonHost } from '../RushDaemonHost';
import { WorkspaceSession } from '../WorkspaceSession';
import { EngineTerminalProvider } from '../EngineTerminalProvider';
import {
  DaemonRequestWireClient,
  createDeferred,
  createWireEnvelope,
  type IDeferred,
  type ITerminalExchange
} from './DaemonRequestWireTestUtilities';

const RUSH_VERSION: string = '5.179.0';

interface IFixture extends AsyncDisposable {
  readonly repoRoot: string;
  readonly host: RushDaemonHost;
  readonly session: WorkspaceSession;
  readonly client: DaemonRequestWireClient;
}

async function createFixtureAsync(cache: boolean = false): Promise<IFixture> {
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
  write('.gitignore', 'common/temp/\n**/.rush/\n**/rush-logs/\n**/lib/\nruns.txt\n');
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
fs.appendFileSync('../../runs.txt', name + ':' + input + ':' + process.argv.slice(2).join(' ') + '\\n');
fs.mkdirSync('lib', { recursive: true });
fs.writeFileSync('lib/output.txt', input);
console.log('built-' + name + '-' + input);
if (input === 'warning') console.error('warning-' + name);
if (input === 'failure') process.exitCode = 7;
`
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

  it('rejects inherited project configuration before creating a graph or running scripts', async () => {
    const fixture: IFixture = await createFixtureAsync();
    try {
      fs.writeFileSync(
        path.join(fixture.repoRoot, 'projects/a/config/rush-project.json'),
        '{"extends":"./unowned.json"}'
      );
      expect((await runAsync(fixture, 'unsupported', ['build'])).terminal).toMatchObject({
        kind: 'requestRejected',
        payload: { code: 'unsupported' }
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
