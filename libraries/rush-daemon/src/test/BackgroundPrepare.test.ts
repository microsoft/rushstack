// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.mock('@microsoft/rush-lib', () => {
  const actual: typeof import('@microsoft/rush-lib') = jest.requireActual('@microsoft/rush-lib');
  return {
    ...actual,
    captureWorkspaceInputFingerprintAsync: jest.fn(actual.captureWorkspaceInputFingerprintAsync)
  };
});

import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { setTimeout as delayAsync } from 'node:timers/promises';

import * as rushLib from '@microsoft/rush-lib';
import {
  DaemonFrameType,
  decodeDaemonControlMessage,
  type DaemonControlMessage,
  type IDaemonFrame,
  type IDaemonRequestEnvelope
} from '@rushstack/rush-daemon-protocol';

import type { WorkspaceSession } from '../WorkspaceSession';
import { DaemonGraphTestFixture, withScriptDeadline } from './DaemonGraphTestFixture';
import {
  createDeferred,
  type DaemonRequestWireClient,
  type IDeferred,
  type ITerminalExchange
} from './DaemonRequestWireTestUtilities';

jest.setTimeout(60_000);

const BUILD_B: string[] = ['build', '--to', 'b', '--parallelism', '3'];
const BUILD_B_DESCRIPTION: string = '"rush build --to b --parallelism 3" in the background';
const BUSY_LOG: string =
  "rushd: another Rush process holds this repository's lock; the daemon prepares in the background " +
  'once that process releases it';
/** Longer than any wait in these tests, so that only the preparation's own progress ends it. */
const WAIT_TIMEOUT_MS: number = 40_000;
// A script such as a dev server, which runs until it is stopped.
const SERVE_A: string = withScriptDeadline(
  "const fs=require('node:fs');fs.appendFileSync('../runs.txt','serve\\n');" +
    "const wait=()=>fs.existsSync('../common/temp/release.flag')?console.log('stopped'):setTimeout(wait,20);" +
    'wait();'
);

const workspaceCaptureMock: jest.MockedFunction<typeof rushLib.captureWorkspaceInputFingerprintAsync> =
  jest.mocked(rushLib.captureWorkspaceInputFingerprintAsync);

// The capture's options hold the whole process environment, and jest prints a mock's arguments when an assertion
// about its calls fails. Tests count the calls instead, so that a failure prints only numbers.
function captureCount(): number {
  return workspaceCaptureMock.mock.calls.length;
}

async function waitForAsync(predicate: () => boolean, description: string): Promise<void> {
  const deadline: number = Date.now() + 30_000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${description}.`);
    await delayAsync(20);
  }
}

function expectSuccess(exchange: ITerminalExchange): void {
  expect(exchange.terminal).toMatchObject({ kind: 'requestResult', payload: { exitCode: 0 } });
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function prepared(preparation: number): RegExp {
  return new RegExp(
    `^rushd: prepared ${escapeRegExp(BUILD_B_DESCRIPTION)} \\(background-prepare-${preparation}\\) in \\d+ ms$`
  );
}

function stopped(preparation: number, reason: string): RegExp {
  return new RegExp(
    `^rushd: stopped preparing ${escapeRegExp(BUILD_B_DESCRIPTION)} \\(background-prepare-${preparation}\\): ` +
      `${reason}$`
  );
}

/** The daemon's log lines about background preparations. */
function backgroundLogs(fixture: DaemonGraphTestFixture): string[] {
  return fixture.logs.filter((message: string) => message.includes('in the background'));
}

async function waitForLogAsync(fixture: DaemonGraphTestFixture, pattern: RegExp): Promise<void> {
  await waitForAsync(
    () => fixture.logs.some((message: string) => pattern.test(message)),
    `the daemon to log ${pattern}`
  );
}

/**
 * Projects a and b have the build of every fixture. Project a's `quick` script appends `quick` to runs.txt and exits;
 * its `serve` script runs until the test writes common/temp/release.flag.
 */
function createFixtureAsync(
  backgroundPrepare: boolean = true,
  configure?: (fixture: DaemonGraphTestFixture) => void
): Promise<DaemonGraphTestFixture> {
  return DaemonGraphTestFixture.createAsync((created) => {
    created.servesRushx = true;
    const rushJson: Record<string, unknown> = readRushJson(created);
    created.write(
      'rush.json',
      JSON.stringify({ ...rushJson, daemon: { warmMemoryBudgetMB: 100_000, backgroundPrepare } })
    );
    created.write(
      'a/package.json',
      JSON.stringify({
        name: 'a',
        version: '1.0.0',
        dependencies: {},
        scripts: { '_phase:compile': 'node build.cjs', quick: 'node quick.cjs', serve: 'node serve.cjs' }
      })
    );
    created.write('a/quick.cjs', "require('node:fs').appendFileSync('../runs.txt','quick\\n');");
    created.write('a/serve.cjs', SERVE_A);
    configure?.(created);
  });
}

function readRushJson(fixture: DaemonGraphTestFixture): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(fixture.folder, 'rush.json'), 'utf8'));
}

let rushJsonChanges: number = 0;

/** Changes rush.json, which the daemon watches, so that the next build reloads the workspace graph. */
function changeRushJson(fixture: DaemonGraphTestFixture, changes: Record<string, unknown> = {}): void {
  fixture.write(
    'rush.json',
    JSON.stringify({ ...readRushJson(fixture), projectFolderMaxDepth: 2 + ++rushJsonChanges, ...changes })
  );
}

let commandLineChanges: number = 0;

/** Adds a global command to command-line.json, which the daemon watches, so that the next build reloads the graph. */
function changeCommandLineJson(fixture: DaemonGraphTestFixture): void {
  const filename: string = path.join(fixture.folder, 'common/config/rush/command-line.json');
  const commandLine: { commands: unknown[] } = JSON.parse(fs.readFileSync(filename, 'utf8'));
  commandLine.commands.push({
    commandKind: 'global',
    name: `hello-${++commandLineChanges}`,
    summary: 'Says hello.',
    shellCommand: 'node -e ""'
  });
  fs.writeFileSync(filename, JSON.stringify(commandLine));
}

function getScriptEnvelope(fixture: DaemonGraphTestFixture): Partial<IDaemonRequestEnvelope> {
  return { commandOrigin: 'custom', invocationKind: 'rushx', cwd: path.join(fixture.folder, 'a') };
}

interface IHold {
  readonly reached: Promise<void>;
  release(): void;
}

/** Holds the next time that the current generation quiesces its warm set, as a reload does first. */
function holdQuiesce(fixture: DaemonGraphTestFixture): IHold {
  const session: WorkspaceSession = fixture.session;
  const quiesceAsync: () => Promise<void> = session.quiesceWarmSetAsync.bind(session);
  const reached: IDeferred<void> = createDeferred<void>();
  const released: IDeferred<void> = createDeferred<void>();
  jest.spyOn(session, 'quiesceWarmSetAsync').mockImplementationOnce(async () => {
    reached.resolve();
    await released.promise;
    await quiesceAsync();
  });
  return { reached: reached.promise, release: () => released.resolve() };
}

/** Holds the next workspace session that the daemon creates, before it loads it. */
function holdSessionCreation(fixture: DaemonGraphTestFixture): IHold {
  const reached: IDeferred<void> = createDeferred<void>();
  const released: IDeferred<void> = createDeferred<void>();
  fixture.beforeCreateSessionAsync = async () => {
    fixture.beforeCreateSessionAsync = undefined;
    reached.resolve();
    await released.promise;
  };
  return { reached: reached.promise, release: () => released.resolve() };
}

interface ILockHolder {
  releaseAsync(): Promise<void>;
}

/** Holds native Rush's repository lock in another process, as `rush install` would, until it is released. */
async function holdRepositoryLockAsync(fixture: DaemonGraphTestFixture): Promise<ILockHolder> {
  const script: string = [
    `const { LockFile } = require(${JSON.stringify(require.resolve('@rushstack/node-core-library'))});`,
    `const lock = LockFile.tryAcquire(${JSON.stringify(path.join(fixture.folder, 'common/temp'))}, 'rush');`,
    "process.stdout.write(lock ? 'held' : 'busy');",
    'process.stdin.resume();',
    "process.stdin.on('end', () => { lock?.release(); process.exit(0); });"
  ].join('\n');
  const child: ChildProcess = spawn(process.execPath, ['-e', script], { stdio: ['pipe', 'pipe', 'inherit'] });
  const releaseAsync = async (): Promise<void> => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const closed: Promise<unknown[]> = once(child, 'close');
    child.stdin!.end();
    await closed;
  };
  try {
    const [output] = await once(child.stdout!, 'data');
    expect(String(output)).toBe('held');
  } catch (error) {
    await releaseAsync();
    throw error;
  }
  return { releaseAsync };
}

interface IStreamedRequest {
  readonly exchange: Promise<ITerminalExchange>;
  /** Whether the daemon has reported a queue position for the request. */
  readonly queued: () => boolean;
  readonly settled: () => boolean;
}

/** Starts a request, recording whether it waits in a queue. */
async function startRequestAsync(
  fixture: DaemonGraphTestFixture,
  argv: string[],
  overrides: Partial<IDaemonRequestEnvelope> = {}
): Promise<IStreamedRequest> {
  const client: DaemonRequestWireClient = await fixture.connectAsync();
  const payload: IDaemonRequestEnvelope = fixture.envelope(argv, {
    admission: { waitTimeoutMs: WAIT_TIMEOUT_MS },
    ...overrides
  });
  await client.sendControlAsync({ kind: 'requestStart', payload });
  let queued: boolean = false;
  let settled: boolean = false;
  const readAsync = async (): Promise<ITerminalExchange> => {
    const frames: IDaemonFrame[] = [];
    try {
      for (;;) {
        const frame: IDaemonFrame = await client.readFrameAsync();
        frames.push(frame);
        if (frame.kind !== DaemonFrameType.controlJson) continue;
        const message: DaemonControlMessage = decodeDaemonControlMessage(frame.payload);
        if (message.kind === 'queuePosition') queued = true;
        if (
          (message.kind === 'requestResult' || message.kind === 'requestRejected') &&
          message.payload.requestId === payload.requestId
        ) {
          return { frames, terminal: message };
        }
      }
    } finally {
      settled = true;
      await client.closeAsync();
    }
  };
  const exchange: Promise<ITerminalExchange> = readAsync();
  // A failed expectation leaves the exchange unread until the fixture closes the connection.
  exchange.catch(() => undefined);
  return { exchange, queued: () => queued, settled: () => settled };
}

/**
 * Holds the next background preparation before it quiesces anything, sends a request while it is held, and releases
 * it once the request waits behind it.
 */
async function sendDuringPreparationAsync(
  fixture: DaemonGraphTestFixture,
  argv: string[],
  overrides?: Partial<IDaemonRequestEnvelope>,
  change: (changed: DaemonGraphTestFixture) => void = changeRushJson
): Promise<ITerminalExchange> {
  const loading: IHold = holdQuiesce(fixture);
  try {
    change(fixture);
    await loading.reached;
    const request: IStreamedRequest = await startRequestAsync(fixture, argv, overrides);
    await waitForAsync(
      () => request.settled() || request.queued(),
      `"${argv.join(' ')}" to wait behind the preparation`
    );
    expect(request.settled()).toBe(false);
    loading.release();
    return await request.exchange;
  } finally {
    // A failed expectation must not leave the preparation held, or disposing the fixture would wait for it.
    loading.release();
  }
}

describe('background preparation', () => {
  let fixture: DaemonGraphTestFixture | undefined;

  afterEach(async () => {
    jest.restoreAllMocks();
    const disposed: DaemonGraphTestFixture | undefined = fixture;
    fixture = undefined;
    await disposed?.[Symbol.asyncDispose]();
  });

  it('A1: prepares the next engine of the last build once its inputs change, and the build then reuses it', async () => {
    fixture = await createFixtureAsync();
    expectSuccess(await fixture.runAsync(BUILD_B));
    const generation: number = fixture.host.workspaceGeneration;
    const runs: string[] = fixture.runs();
    const engines: jest.SpyInstance = jest.spyOn(rushLib.PhasedCommandEngine.prototype, 'createEngineAsync');

    changeRushJson(fixture);
    await waitForLogAsync(fixture, prepared(1));
    expect(backgroundLogs(fixture)).toEqual([expect.stringMatching(prepared(1))]);
    expect(fixture.host.workspaceGeneration).toBe(generation + 1);
    expect(fixture.host.workspaceStatus.lastReloadTier).toBe(rushLib.WorkspaceInputChangeTier.Reload);
    expect(engines).toHaveBeenCalledTimes(1);
    expect(fixture.runs()).toEqual(runs);

    // It keeps up with a later change too, with no request in between.
    changeRushJson(fixture);
    await waitForLogAsync(fixture, prepared(2));
    expect(fixture.host.workspaceGeneration).toBe(generation + 2);
    expect(engines).toHaveBeenCalledTimes(2);

    expectSuccess(await fixture.runAsync(BUILD_B));
    expect(fixture.host.workspaceStatus.lastReloadTier).toBe(rushLib.WorkspaceInputChangeTier.Reuse);
    expect(engines).toHaveBeenCalledTimes(2);
    expect(fixture.host.workspaceGeneration).toBe(generation + 2);
    expect(backgroundLogs(fixture)).toEqual([
      expect.stringMatching(prepared(1)),
      expect.stringMatching(prepared(2))
    ]);
  });

  it('A2: serves a build of the same command line on the engine that it is preparing', async () => {
    fixture = await createFixtureAsync();
    expectSuccess(await fixture.runAsync(BUILD_B));
    const generation: number = fixture.host.workspaceGeneration;
    const engines: jest.SpyInstance = jest.spyOn(rushLib.PhasedCommandEngine.prototype, 'createEngineAsync');

    expectSuccess(await sendDuringPreparationAsync(fixture, BUILD_B));
    expect(backgroundLogs(fixture)).toEqual([expect.stringMatching(prepared(1))]);
    expect(engines).toHaveBeenCalledTimes(1);
    expect(fixture.host.workspaceStatus.lastReloadTier).toBe(rushLib.WorkspaceInputChangeTier.Reuse);
    expect(fixture.host.workspaceGeneration).toBe(generation + 1);
  });

  it('A3a: stops for a rushx script, and prepares again once the daemon is idle', async () => {
    fixture = await createFixtureAsync();
    expectSuccess(await fixture.runAsync(BUILD_B));
    const generation: number = fixture.host.workspaceGeneration;

    // A served rushx script never runs on a loaded rush.json that changed since, so this changes command-line.json.
    expectSuccess(
      await sendDuringPreparationAsync(fixture, ['quick'], getScriptEnvelope(fixture), changeCommandLineJson)
    );
    expect(fixture.runs().filter((line: string) => line === 'quick')).toHaveLength(1);
    expect(backgroundLogs(fixture)).toEqual([
      expect.stringMatching(stopped(1, 'request graph-\\d+ needs the workspace'))
    ]);
    expect(fixture.host.workspaceGeneration).toBe(generation);

    await waitForLogAsync(fixture, prepared(2));
    expect(fixture.host.workspaceGeneration).toBe(generation + 1);
  });

  it('A3b: stops for a graph request, and prepares again once the daemon is idle', async () => {
    fixture = await createFixtureAsync();
    expectSuccess(await fixture.runAsync(BUILD_B));
    const generation: number = fixture.host.workspaceGeneration;

    expectSuccess(await sendDuringPreparationAsync(fixture, ['daemon', 'graph', 'status']));
    expect(backgroundLogs(fixture)).toEqual([
      expect.stringMatching(stopped(1, 'request graph-\\d+ needs the workspace'))
    ]);
    expect(fixture.host.workspaceGeneration).toBe(generation);

    await waitForLogAsync(fixture, prepared(2));
    expect(fixture.host.workspaceGeneration).toBe(generation + 1);
  });

  it('A3c: stops for a build of another command line, which then loads the workspace itself', async () => {
    fixture = await createFixtureAsync();
    expectSuccess(await fixture.runAsync(BUILD_B));
    const generation: number = fixture.host.workspaceGeneration;

    expectSuccess(await sendDuringPreparationAsync(fixture, ['build', '--to', 'a', '--parallelism', '3']));
    expect(backgroundLogs(fixture)).toEqual([
      expect.stringMatching(stopped(1, 'request graph-\\d+ needs the workspace'))
    ]);
    expect(fixture.host.workspaceStatus.lastReloadTier).toBe(rushLib.WorkspaceInputChangeTier.Reload);
    expect(fixture.host.workspaceGeneration).toBe(generation + 1);
  });

  it('A4: waits while another Rush process holds the repository lock, and logs that once', async () => {
    fixture = await createFixtureAsync();
    expectSuccess(await fixture.runAsync(BUILD_B));
    const holder: ILockHolder = await holdRepositoryLockAsync(fixture);
    try {
      const quiesce: jest.SpyInstance = jest.spyOn(fixture.session, 'quiesceWarmSetAsync');
      changeRushJson(fixture);
      await waitForAsync(() => fixture!.logs.includes(BUSY_LOG), 'the preparation to find the lock held');
      // The next check, 2 s later, finds it held too.
      await delayAsync(3000);
      expect(backgroundLogs(fixture)).toEqual([BUSY_LOG]);
      expect(quiesce).not.toHaveBeenCalled();
    } finally {
      await holder.releaseAsync();
    }
    await waitForLogAsync(fixture, prepared(1));
    expect(backgroundLogs(fixture)).toEqual([BUSY_LOG, expect.stringMatching(prepared(1))]);
  });

  it('A5: does not prepare for a change that restarts the daemon', async () => {
    fixture = await createFixtureAsync();
    expectSuccess(await fixture.runAsync(BUILD_B));
    const generation: number = fixture.host.workspaceGeneration;
    const quiesce: jest.SpyInstance = jest.spyOn(fixture.session, 'quiesceWarmSetAsync');
    workspaceCaptureMock.mockClear();

    fixture.write(
      'common/config/rush/npm-shrinkwrap.json',
      '{"lockfileVersion":3,"packages":{},"requires":true}'
    );
    await waitForAsync(() => workspaceCaptureMock.mock.calls.length > 0, 'the daemon to check the change');
    await Promise.allSettled(workspaceCaptureMock.mock.results.map((result) => result.value));
    await delayAsync(500);
    expect(quiesce).not.toHaveBeenCalled();
    expect(backgroundLogs(fixture)).toEqual([]);
    expect(fixture.host.workspaceGeneration).toBe(generation);
  });

  it('A6: does nothing unless rush.json turns it on', async () => {
    fixture = await createFixtureAsync(false);
    expectSuccess(await fixture.runAsync(BUILD_B));
    workspaceCaptureMock.mockClear();

    changeRushJson(fixture);
    await delayAsync(4000);
    expect(captureCount()).toBe(0);
    expect(backgroundLogs(fixture)).toEqual([]);
    expectSuccess(await fixture.runAsync(BUILD_B));
    expect(fixture.host.workspaceStatus.lastReloadTier).toBe(rushLib.WorkspaceInputChangeTier.Reload);
  });

  it('A7: prepares again when the inputs change while it loads', async () => {
    fixture = await createFixtureAsync();
    expectSuccess(await fixture.runAsync(BUILD_B));
    const loading: IHold = holdSessionCreation(fixture);
    try {
      changeRushJson(fixture);
      await loading.reached;
      changeRushJson(fixture);
    } finally {
      loading.release();
    }
    await waitForLogAsync(fixture, prepared(2));
    expect(backgroundLogs(fixture)).toEqual([
      expect.stringMatching(
        stopped(1, 'Workspace changes require the reusable engine and session to be recreated\\.')
      ),
      expect.stringMatching(prepared(2))
    ]);

    const engines: jest.SpyInstance = jest.spyOn(rushLib.PhasedCommandEngine.prototype, 'createEngineAsync');
    expectSuccess(await fixture.runAsync(BUILD_B));
    expect(fixture.host.workspaceStatus.lastReloadTier).toBe(rushLib.WorkspaceInputChangeTier.Reuse);
    expect(engines).not.toHaveBeenCalled();
  });

  it('A8: stops preparing after a failure until a phased command is served again, and never runs event hooks', async () => {
    fixture = await createFixtureAsync(true, (created) => {
      created.write('hook.cjs', "require('node:fs').writeFileSync(__dirname + '/hook-marker.txt', '');");
    });
    expectSuccess(await fixture.runAsync(BUILD_B));

    changeRushJson(fixture, { eventHooks: { preRushBuild: ['node hook.cjs'] } });
    const failed: RegExp = new RegExp(
      `^rushd: could not prepare ${escapeRegExp(BUILD_B_DESCRIPTION)} \\(background-prepare-1\\): ` +
        '.*Build event-hook scripts require --no-daemon'
    );
    await waitForLogAsync(fixture, failed);
    workspaceCaptureMock.mockClear();
    changeRushJson(fixture);
    await delayAsync(4000);
    expect(captureCount()).toBe(0);
    expect(backgroundLogs(fixture)).toEqual([expect.stringMatching(failed)]);
    expect(fs.existsSync(path.join(fixture.folder, 'hook-marker.txt'))).toBe(false);
  });

  it('A9: waits until no rushx script runs', async () => {
    fixture = await createFixtureAsync();
    expectSuccess(await fixture.runAsync(BUILD_B));
    const serving: Promise<ITerminalExchange> = fixture.runAsync(['serve'], getScriptEnvelope(fixture));
    await Promise.race([
      waitForAsync(() => fixture!.runs().includes('serve'), 'the script to start'),
      serving.then((exchange: ITerminalExchange) => {
        throw new Error(`The script ended before it ran: ${JSON.stringify(exchange.terminal)}`);
      })
    ]);
    const quiesce: jest.SpyInstance = jest.spyOn(fixture.session, 'quiesceWarmSetAsync');
    workspaceCaptureMock.mockClear();

    try {
      changeRushJson(fixture);
      await delayAsync(5000);
      expect(captureCount()).toBe(0);
      expect(quiesce).not.toHaveBeenCalled();
      expect(backgroundLogs(fixture)).toEqual([]);
    } finally {
      fixture.write('common/temp/release.flag', '');
    }
    expectSuccess(await serving);
    await waitForLogAsync(fixture, prepared(1));
  });

  it('A10: builds an input change made after the preparation, on the engine that it prepared', async () => {
    fixture = await createFixtureAsync();
    expectSuccess(await fixture.runAsync(BUILD_B));
    const runs: string[] = fixture.runs();
    const engines: jest.SpyInstance = jest.spyOn(rushLib.PhasedCommandEngine.prototype, 'createEngineAsync');

    changeRushJson(fixture);
    await waitForLogAsync(fixture, prepared(1));
    fixture.write('a/input.txt', 'two');
    expectSuccess(await fixture.runAsync(BUILD_B));
    expect(fixture.host.workspaceStatus.lastReloadTier).toBe(rushLib.WorkspaceInputChangeTier.Reuse);
    expect(engines).toHaveBeenCalledTimes(1);
    expect(fixture.runs()).toEqual([...runs, 'a', 'b']);
  });

  it('A11: builds an input change made while the preparation runs, after its capture', async () => {
    fixture = await createFixtureAsync();
    expectSuccess(await fixture.runAsync(BUILD_B));
    const runs: string[] = fixture.runs();
    const engines: jest.SpyInstance = jest.spyOn(rushLib.PhasedCommandEngine.prototype, 'createEngineAsync');

    const loading: IHold = holdQuiesce(fixture);
    try {
      changeRushJson(fixture);
      await loading.reached;
      fixture.write('a/input.txt', 'two');
    } finally {
      loading.release();
    }
    await waitForLogAsync(fixture, prepared(1));
    expect(fixture.runs()).toEqual(runs);
    expectSuccess(await fixture.runAsync(BUILD_B));
    expect(fixture.host.workspaceStatus.lastReloadTier).toBe(rushLib.WorkspaceInputChangeTier.Reuse);
    expect(engines).toHaveBeenCalledTimes(1);
    expect(fixture.runs()).toEqual([...runs, 'a', 'b']);
  });

  it('A12: stops preparing after a failure that leaves its session current, until a phased command is served again', async () => {
    const captureAsync: typeof rushLib.captureWorkspaceInputFingerprintAsync =
      jest.requireActual<typeof rushLib>('@microsoft/rush-lib').captureWorkspaceInputFingerprintAsync;
    fixture = await createFixtureAsync();
    expectSuccess(await fixture.runAsync(BUILD_B));
    const generation: number = fixture.host.workspaceGeneration;
    try {
      // The check captures first. The preparation's own capture comes next, before the reload replaces the session.
      workspaceCaptureMock
        .mockImplementationOnce(captureAsync)
        .mockRejectedValueOnce(new Error('The capture failed.'));
      changeRushJson(fixture);
      const failed: RegExp = new RegExp(
        `^rushd: could not prepare ${escapeRegExp(BUILD_B_DESCRIPTION)} \\(background-prepare-1\\): ` +
          'The capture failed\\.$'
      );
      await waitForLogAsync(fixture, failed);
      expect(fixture.host.workspaceGeneration).toBe(generation);

      workspaceCaptureMock.mockClear();
      changeRushJson(fixture);
      await delayAsync(4000);
      expect(captureCount()).toBe(0);
      expect(backgroundLogs(fixture)).toEqual([expect.stringMatching(failed)]);
      expect(fixture.host.workspaceGeneration).toBe(generation);

      // Serving the build again turns it back on.
      expectSuccess(await fixture.runAsync(BUILD_B));
      changeRushJson(fixture);
      await waitForLogAsync(fixture, prepared(2));
      expect(backgroundLogs(fixture)).toEqual([
        expect.stringMatching(failed),
        expect.stringMatching(prepared(2))
      ]);
    } finally {
      // A capture queued above that the daemon never made must not reach a later test.
      workspaceCaptureMock.mockReset();
      workspaceCaptureMock.mockImplementation(captureAsync);
    }
  });

  it('E1: prepares with the environment of the daemon, and not of the client whose build it prepares again', async () => {
    const traceParent: string = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
    fixture = await createFixtureAsync();
    const traced: Partial<IDaemonRequestEnvelope> = {
      environment: { ...fixture.environment, TRACEPARENT: traceParent }
    };
    expectSuccess(await fixture.runAsync(BUILD_B, traced));
    const parses: jest.SpyInstance = jest.spyOn(rushLib.PhasedCommandEngine, 'parseAsync');

    changeRushJson(fixture);
    await waitForLogAsync(fixture, prepared(1));
    expect(parses).toHaveBeenCalled();
    for (const [options] of parses.mock.calls as [rushLib.IParsePhasedCommandOptions][]) {
      expect(options.environment?.TRACEPARENT).not.toBe(traceParent);
    }

    const engines: jest.SpyInstance = jest.spyOn(rushLib.PhasedCommandEngine.prototype, 'createEngineAsync');
    expectSuccess(await fixture.runAsync(BUILD_B, traced));
    expect(fixture.host.workspaceStatus.lastReloadTier).toBe(rushLib.WorkspaceInputChangeTier.Reuse);
    expect(engines).not.toHaveBeenCalled();
  });
});
