// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import { formatNativeLockHolder } from '@rushstack/rush-client-core';
import {
  DaemonFrameType,
  decodeDaemonControlMessage,
  type DaemonControlMessage,
  type IDaemonFrame,
  type IDaemonNativeLockHolder,
  type IDaemonRequestEnvelope,
  type IDaemonRequestQueuePositionMessage
} from '@rushstack/rush-daemon-protocol';

import type {
  IDaemonRequestResolver,
  IResolveDaemonRequestOptions,
  ResolvedDaemonRequest
} from '../DaemonRequestDispatcher';
import type { WorkspaceSession } from '../WorkspaceSession';
import {
  isRushxInvocation,
  wrapWorkspaceResolverLifecycle,
  type IWorkspaceResolverLifecycle
} from '../WorkspaceResolverLifecycle';
import { DaemonGraphTestFixture } from './DaemonGraphTestFixture';
import {
  createDeferred,
  type DaemonRequestWireClient,
  type IDeferred,
  type ITerminalExchange
} from './DaemonRequestWireTestUtilities';

jest.setTimeout(60_000);

const BUILD_A: string[] = ['build', '--to', 'a', '--parallelism', '3'];
/** Longer than any wait in these tests, so that only the reload's own progress ends it. */
const RELOAD_WAIT_TIMEOUT_MS: number = 40_000;

function delayAsync(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
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

/** Project a's `quick` script appends `quick` to runs.txt and exits. */
function createFixtureAsync(
  configure?: (fixture: DaemonGraphTestFixture) => void
): Promise<DaemonGraphTestFixture> {
  return DaemonGraphTestFixture.createAsync((created) => {
    created.servesRushx = true;
    created.write(
      'a/package.json',
      JSON.stringify({
        name: 'a',
        version: '1.0.0',
        dependencies: {},
        scripts: { '_phase:compile': 'node build.cjs', quick: 'node quick.cjs' }
      })
    );
    created.write('a/quick.cjs', "require('node:fs').appendFileSync('../runs.txt','quick\\n');");
    configure?.(created);
  });
}

function countScriptRuns(fixture: DaemonGraphTestFixture): number {
  return fixture.runs().filter((line: string) => line === 'quick').length;
}

function getScriptEnvelope(
  fixture: DaemonGraphTestFixture,
  waitTimeoutMs: number
): Partial<IDaemonRequestEnvelope> {
  return {
    commandOrigin: 'custom',
    invocationKind: 'rushx',
    cwd: path.join(fixture.folder, 'a'),
    admission: { waitTimeoutMs }
  };
}

let configurationChanges: number = 0;

/** Changes project c's configuration, so that the next build reloads the graph. */
function changeProjectConfiguration(fixture: DaemonGraphTestFixture): void {
  const packageJsonPath: string = path.join(fixture.folder, 'c/package.json');
  const packageJson: Record<string, unknown> = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  fs.writeFileSync(
    packageJsonPath,
    JSON.stringify({ ...packageJson, description: `changed ${++configurationChanges}` })
  );
}

/** Writes rush.json's default `projectFolderMaxDepth` into it, which changes the file but not the workspace. */
function changeRushJson(fixture: DaemonGraphTestFixture): void {
  const rushJsonPath: string = path.join(fixture.folder, 'rush.json');
  const rushJson: Record<string, unknown> = JSON.parse(fs.readFileSync(rushJsonPath, 'utf8'));
  fs.writeFileSync(rushJsonPath, JSON.stringify({ ...rushJson, projectFolderMaxDepth: 2 }));
}

interface ILockHolder {
  readonly pid: number;
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
  return { pid: child.pid!, releaseAsync };
}

interface IStreamedRequest {
  readonly exchange: Promise<ITerminalExchange>;
  /** The payloads of the queue positions that the daemon has reported so far. */
  readonly positionPayloads: ReadonlyArray<IDaemonRequestQueuePositionMessage['payload']>;
  readonly settled: () => boolean;
}

/** Starts a request, recording its queue positions as they arrive. */
async function startRequestAsync(
  fixture: DaemonGraphTestFixture,
  argv: string[],
  overrides: Partial<IDaemonRequestEnvelope>
): Promise<IStreamedRequest> {
  const client: DaemonRequestWireClient = await fixture.connectAsync();
  const payload: IDaemonRequestEnvelope = fixture.envelope(argv, overrides);
  await client.sendControlAsync({ kind: 'requestStart', payload });
  const positionPayloads: IDaemonRequestQueuePositionMessage['payload'][] = [];
  let settled: boolean = false;
  const readAsync = async (): Promise<ITerminalExchange> => {
    const frames: IDaemonFrame[] = [];
    try {
      for (;;) {
        const frame: IDaemonFrame = await client.readFrameAsync();
        frames.push(frame);
        if (frame.kind !== DaemonFrameType.controlJson) continue;
        const message: DaemonControlMessage = decodeDaemonControlMessage(frame.payload);
        if (message.kind === 'queuePosition') positionPayloads.push(message.payload);
        if (message.kind === 'requestResult' && message.payload.requestId === payload.requestId) {
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
  return { exchange, positionPayloads, settled: () => settled };
}

/** Changes the configuration and starts a build that reloads the graph for it. */
async function startReloadAsync(fixture: DaemonGraphTestFixture): Promise<IStreamedRequest> {
  changeProjectConfiguration(fixture);
  return await startRequestAsync(fixture, BUILD_A, { admission: { waitTimeoutMs: RELOAD_WAIT_TIMEOUT_MS } });
}

/** What the daemon says about `holder`. Only Linux can tell which process holds the lock. */
function getExpectedHolder(holder: ILockHolder): IDaemonNativeLockHolder {
  return process.platform === 'linux' ? { pid: holder.pid } : {};
}

async function waitForLockWaitAsync(reload: IStreamedRequest, holder: ILockHolder): Promise<void> {
  const expected: IDaemonNativeLockHolder = getExpectedHolder(holder);
  await waitForAsync(
    () =>
      reload.settled() ||
      reload.positionPayloads.some((p) => isDeepStrictEqual(p.nativeLockHolder, expected)),
    'the reload to wait for the repository lock'
  );
  expect(reload.settled()).toBe(false);
}

interface IHold {
  readonly reached: Promise<void>;
  release(): void;
}

/** Holds the next time that the reload of the current generation quiesces its warm set, as it does before the lock. */
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

/** Holds the next rushx request that a {@link HeldScriptResolver} resolves, until the test releases it. */
class ScriptResolutionHold {
  #next: { readonly reached: IDeferred<void>; readonly released: IDeferred<void> } | undefined;

  public arm(): IHold {
    const next: { readonly reached: IDeferred<void>; readonly released: IDeferred<void> } = {
      reached: createDeferred<void>(),
      released: createDeferred<void>()
    };
    this.#next = next;
    return { reached: next.reached.promise, release: () => next.released.resolve() };
  }

  public async waitAsync(): Promise<void> {
    const next: { readonly reached: IDeferred<void>; readonly released: IDeferred<void> } | undefined =
      this.#next;
    this.#next = undefined;
    if (!next) return;
    next.reached.resolve();
    await next.released.promise;
  }
}

class HeldScriptResolver implements IDaemonRequestResolver {
  public readonly workspaceLifecycle: IWorkspaceResolverLifecycle | undefined;
  readonly #resolver: IDaemonRequestResolver;
  readonly #hold: ScriptResolutionHold;

  public constructor(resolver: IDaemonRequestResolver, hold: ScriptResolutionHold) {
    this.#resolver = resolver;
    this.#hold = hold;
    this.workspaceLifecycle = wrapWorkspaceResolverLifecycle(
      resolver,
      (replacement: IDaemonRequestResolver) => new HeldScriptResolver(replacement, hold)
    );
  }

  public async resolveRequestAsync(options: IResolveDaemonRequestOptions): Promise<ResolvedDaemonRequest> {
    if (isRushxInvocation(options.envelope)) await this.#hold.waitAsync();
    return await this.#resolver.resolveRequestAsync(options);
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    await this.#resolver[Symbol.asyncDispose]?.();
  }
}

describe('a served rushx script while a reload waits for another Rush process', () => {
  it('starts at once on the current generation while the reload waits for the lock, but not while it loads', async () => {
    const fixture: DaemonGraphTestFixture = await createFixtureAsync();
    let holder: ILockHolder | undefined;
    let loading: IHold | undefined;
    try {
      expectSuccess(await fixture.runAsync(BUILD_A));
      const generation: number = fixture.host.workspaceGeneration;
      holder = await holdRepositoryLockAsync(fixture);
      const reload: IStreamedRequest = await startReloadAsync(fixture);
      await waitForLockWaitAsync(reload, holder);

      // The script used to wait behind the reload until its own wait timeout ended, and never ran.
      expectSuccess(await fixture.runAsync(['quick'], getScriptEnvelope(fixture, 2000)));
      expect(countScriptRuns(fixture)).toBe(1);
      expect(reload.settled()).toBe(false);
      expect(fixture.host.workspaceGeneration).toBe(generation);

      await holder.releaseAsync();
      expectSuccess(await reload.exchange);
      const reloadedGeneration: number = fixture.host.workspaceGeneration;
      expect(reloadedGeneration).toBeGreaterThan(generation);

      // A reload that is loading the graph, and not waiting for another process, still holds the script.
      loading = holdQuiesce(fixture);
      const nextReload: IStreamedRequest = await startReloadAsync(fixture);
      await loading.reached;
      const script: IStreamedRequest = await startRequestAsync(
        fixture,
        ['quick'],
        getScriptEnvelope(fixture, 2000)
      );
      await delayAsync(1000);
      expect(script.settled()).toBe(false);
      expect(countScriptRuns(fixture)).toBe(1);
      loading.release();
      expectSuccess(await nextReload.exchange);
      expectSuccess(await script.exchange);
      expect(countScriptRuns(fixture)).toBe(2);
      expect(fixture.host.workspaceGeneration).toBeGreaterThan(reloadedGeneration);
    } finally {
      // A failed expectation must not leave the reload held, or disposing the fixture would wait for it.
      loading?.release();
      await holder?.releaseAsync();
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('lets a script that waits behind the reload pass once the reload waits for the lock', async () => {
    const fixture: DaemonGraphTestFixture = await createFixtureAsync();
    let holder: ILockHolder | undefined;
    let loading: IHold | undefined;
    try {
      expectSuccess(await fixture.runAsync(BUILD_A));
      const generation: number = fixture.host.workspaceGeneration;
      holder = await holdRepositoryLockAsync(fixture);
      loading = holdQuiesce(fixture);
      const reload: IStreamedRequest = await startReloadAsync(fixture);
      await loading.reached;
      const script: IStreamedRequest = await startRequestAsync(
        fixture,
        ['quick'],
        getScriptEnvelope(fixture, 2000)
      );
      await waitForAsync(() => script.positionPayloads.length > 0, 'the script to wait behind the reload');

      loading.release();
      await waitForLockWaitAsync(reload, holder);
      expectSuccess(await script.exchange);
      expect(countScriptRuns(fixture)).toBe(1);
      expect(reload.settled()).toBe(false);
      expect(fixture.host.workspaceGeneration).toBe(generation);
      // It passed the reload as soon as the reload began to wait, so it was never told to wait for the holder.
      expect(script.positionPayloads.filter((p) => p.nativeLockHolder !== undefined)).toEqual([]);

      await holder.releaseAsync();
      expectSuccess(await reload.exchange);
      expect(fixture.host.workspaceGeneration).toBeGreaterThan(generation);
    } finally {
      loading?.release();
      await holder?.releaseAsync();
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('replaces the generation only after each script that passed the reload has started', async () => {
    const resolution: ScriptResolutionHold = new ScriptResolutionHold();
    const fixture: DaemonGraphTestFixture = await createFixtureAsync((created) => {
      created.wrapResolver = (resolver: IDaemonRequestResolver) =>
        new HeldScriptResolver(resolver, resolution);
    });
    let holder: ILockHolder | undefined;
    let resolving: IHold | undefined;
    try {
      expectSuccess(await fixture.runAsync(BUILD_A));
      const generation: number = fixture.host.workspaceGeneration;
      holder = await holdRepositoryLockAsync(fixture);
      const reload: IStreamedRequest = await startReloadAsync(fixture);
      await waitForLockWaitAsync(reload, holder);

      resolving = resolution.arm();
      let resolvingReached: boolean = false;
      void resolving.reached.then(() => {
        resolvingReached = true;
      });
      const script: IStreamedRequest = await startRequestAsync(
        fixture,
        ['quick'],
        getScriptEnvelope(fixture, 5000)
      );
      await waitForAsync(() => resolvingReached || script.settled(), 'the script to pass the reload');
      expect(script.settled()).toBe(false);
      await holder.releaseAsync();
      // The reload tries the lock every 250 ms. Once it has it, it waits for the script that is still resolving.
      await delayAsync(1000);
      expect(reload.settled()).toBe(false);
      expect(fixture.host.workspaceGeneration).toBe(generation);

      resolving.release();
      expectSuccess(await script.exchange);
      expectSuccess(await reload.exchange);
      expect(countScriptRuns(fixture)).toBe(1);
      expect(fixture.host.workspaceGeneration).toBeGreaterThan(generation);
    } finally {
      resolving?.release();
      await holder?.releaseAsync();
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('starts at once while the first build of a new daemon waits for the lock', async () => {
    const fixture: DaemonGraphTestFixture = await createFixtureAsync();
    let holder: ILockHolder | undefined;
    try {
      holder = await holdRepositoryLockAsync(fixture);
      // The first build loads the graph through the same reload, so the script resolves on the session it created.
      const build: IStreamedRequest = await startRequestAsync(fixture, BUILD_A, {
        admission: { waitTimeoutMs: RELOAD_WAIT_TIMEOUT_MS }
      });
      await waitForLockWaitAsync(build, holder);
      const generation: number = fixture.host.workspaceGeneration;

      expectSuccess(await fixture.runAsync(['quick'], getScriptEnvelope(fixture, 2000)));
      expect(countScriptRuns(fixture)).toBe(1);
      expect(build.settled()).toBe(false);
      expect(fixture.host.workspaceGeneration).toBe(generation);

      await holder.releaseAsync();
      expectSuccess(await build.exchange);
      expect(fixture.host.workspaceGeneration).toBeGreaterThan(generation);
    } finally {
      await holder?.releaseAsync();
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('replaces the generation after a script that passed the reload is handed back before it starts', async () => {
    const fixture: DaemonGraphTestFixture = await createFixtureAsync();
    let holder: ILockHolder | undefined;
    try {
      expectSuccess(await fixture.runAsync(BUILD_A));
      const generation: number = fixture.host.workspaceGeneration;
      holder = await holdRepositoryLockAsync(fixture);
      const reload: IStreamedRequest = await startReloadAsync(fixture);
      await waitForLockWaitAsync(reload, holder);

      // After an edit to rush.json, the resolver hands the script back, and the client runs it in-process.
      changeRushJson(fixture);
      const { terminal } = await fixture.runAsync(['quick'], getScriptEnvelope(fixture, 2000));
      expect(terminal).toMatchObject({ kind: 'requestRejected', payload: { code: 'unsupported' } });
      expect(countScriptRuns(fixture)).toBe(0);
      expect(reload.settled()).toBe(false);

      // The script never started, so the reload would wait for it forever if its pass outlived the request.
      await holder.releaseAsync();
      await waitForAsync(() => reload.settled(), 'the reload to finish');
      expectSuccess(await reload.exchange);
      expect(fixture.host.workspaceGeneration).toBeGreaterThan(generation);
    } finally {
      await holder?.releaseAsync();
      await fixture[Symbol.asyncDispose]();
    }
  });
});

describe('a served build that waits behind a reload that waits for another Rush process', () => {
  it('is told which process the reload waits for, and its wait timeout names that process', async () => {
    const fixture: DaemonGraphTestFixture = await createFixtureAsync();
    let holder: ILockHolder | undefined;
    try {
      expectSuccess(await fixture.runAsync(BUILD_A));
      holder = await holdRepositoryLockAsync(fixture);
      const reload: IStreamedRequest = await startReloadAsync(fixture);
      await waitForLockWaitAsync(reload, holder);
      const nativeLockHolder: IDaemonNativeLockHolder = getExpectedHolder(holder);

      // Its client used to be told only its position, and its timeout named only the reload.
      const short: IStreamedRequest = await startRequestAsync(fixture, BUILD_A, {
        admission: { waitTimeoutMs: 2000 }
      });
      expect((await short.exchange).terminal).toMatchObject({
        kind: 'requestResult',
        payload: {
          exitCode: 1,
          admissionErrorCode: 'wait-timeout',
          errorMessage:
            "The request was not admitted within its 2000ms wait timeout while waiting for another request's " +
            `load or reload of the workspace graph, which waits for ${formatNativeLockHolder(nativeLockHolder)} ` +
            "to release this repository's lock. Use --wait-timeout <seconds> to wait longer."
        }
      });
      expect(short.positionPayloads).toEqual([
        { position: 1, requestId: expect.any(String), nativeLockHolder }
      ]);

      const long: IStreamedRequest = await startRequestAsync(fixture, BUILD_A, {
        admission: { waitTimeoutMs: RELOAD_WAIT_TIMEOUT_MS }
      });
      await waitForAsync(() => long.positionPayloads.length > 0, 'the build to wait behind the reload');
      await holder.releaseAsync();
      expectSuccess(await reload.exchange);
      expectSuccess(await long.exchange);
      // Once the reload has the lock, the build still waits for the reload, but not for another process.
      expect(long.positionPayloads).toEqual([
        { position: 1, requestId: expect.any(String), nativeLockHolder },
        { position: 1, requestId: expect.any(String) }
      ]);
    } finally {
      await holder?.releaseAsync();
      await fixture[Symbol.asyncDispose]();
    }
  });
});
