// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';

import type {
  IDaemonPhasedRequest,
  IDaemonPhasedRequestResult,
  IDaemonRequestAdmissionOptions,
  IDaemonRequestQueuePositionMessage
} from '@rushstack/rush-daemon-protocol';
import { PhasedCommandEngineBusyError, type RushConfiguration } from '@microsoft/rush-lib';
import { LockFile } from '@rushstack/node-core-library';

import { PhasedRequestRouter } from '../PhasedRequestRouter';
import {
  TEST_ENGINE_SHAPE,
  TestOperationRunner,
  TestPhasedRequestClient,
  createRoutingFixture
} from './PhasedRequestRouterTestUtilities';
import type { ITestClientWrite, ITestRoutingFixture } from './PhasedRequestRouterTestUtilities';

const OPERATION_A: string = 'project-a (_phase:test)';
const LOCK_RELEASED: string = "to release this repository's lock";
const LOCK_FOLDERS: string = path.resolve(__dirname, '../../temp/test/router-native-lock');
// On Windows, the lock file does not name its process, so the daemon cannot tell that it holds the lock itself.
const unixIt: typeof it = process.platform === 'win32' ? it.skip : it;

/** Stands in for the execution lease, which holds native Rush's repository lock, while another Rush process holds it. */
class ExecutionLeaseProbe {
  public attempts: number = 0;
  public acquisitions: number = 0;
  #held: boolean = true;

  public constructor(fixture: ITestRoutingFixture) {
    fixture.session.acquireExecutionLeaseAsync = async (): Promise<AsyncDisposable> => {
      this.attempts++;
      if (this.#held) throw new PhasedCommandEngineBusyError();
      this.acquisitions++;
      return { [Symbol.asyncDispose]: async (): Promise<void> => undefined };
    };
  }

  /** The Rush process that held the lock exits. */
  public free(): void {
    this.#held = false;
  }
}

function createFixture(): ITestRoutingFixture {
  return createRoutingFixture(new Map([[OPERATION_A, new TestOperationRunner(OPERATION_A)]]));
}

/** Gives the fixture a common temp folder of its own, which is where native Rush's repository lock lives. */
function useLockFolder(fixture: ITestRoutingFixture, name: string): string {
  const folder: string = path.join(LOCK_FOLDERS, name);
  fs.rmSync(folder, { recursive: true, force: true });
  fs.mkdirSync(folder, { recursive: true });
  const rushConfiguration: RushConfiguration = Object.create(fixture.session.rushConfiguration, {
    commonTempFolder: { value: folder }
  });
  Object.defineProperty(fixture.session, 'rushConfiguration', { value: rushConfiguration });
  return folder;
}

function createRequest(requestId: string, admission: IDaemonRequestAdmissionOptions): IDaemonPhasedRequest {
  return {
    admission,
    commandName: 'build',
    commandOrigin: 'built-in',
    engineShape: TEST_ENGINE_SHAPE,
    environment: {},
    operationSelection: [{ enabledState: true, operationId: OPERATION_A }],
    requestId
  };
}

function getQueuePositions(client: TestPhasedRequestClient): IDaemonRequestQueuePositionMessage[] {
  return client.writes.flatMap(({ queuePosition }: ITestClientWrite) =>
    queuePosition ? [queuePosition] : []
  );
}

function waitMessage(requestId: string): IDaemonRequestQueuePositionMessage {
  return {
    kind: 'queuePosition',
    payload: { position: 1, requestId, nativeLockHolder: expect.any(Object) }
  };
}

async function waitUntilAsync(condition: () => boolean): Promise<void> {
  while (!condition()) await new Promise<void>((resolve) => setTimeout(resolve, 10));
}

/** Runs what is due on jest's fake clock, without moving it, until `condition` holds. */
async function settleUntilAsync(condition: () => boolean): Promise<void> {
  for (let turn: number = 0; !condition(); turn++) {
    if (turn === 100) throw new Error('The condition does not hold without moving the fake clock.');
    await jest.advanceTimersByTimeAsync(0);
  }
}

/** Returns a function that says whether `promise` has settled. */
function trackSettled(promise: Promise<unknown>): () => boolean {
  let settled: boolean = false;
  const settle = (): void => {
    settled = true;
  };
  promise.then(settle, settle);
  return () => settled;
}

describe(`${PhasedRequestRouter.name} and native Rush's repository lock`, () => {
  it('waits for another Rush process to release the lock, tells the client, and then runs the request', async () => {
    const fixture: ITestRoutingFixture = createFixture();
    const probe: ExecutionLeaseProbe = new ExecutionLeaseProbe(fixture);
    const client: TestPhasedRequestClient = new TestPhasedRequestClient('one');
    const result: Promise<IDaemonPhasedRequestResult> = new PhasedRequestRouter(fixture.session).executeAsync(
      createRequest('waiting', { waitTimeoutMs: 30_000 }),
      client
    );
    await waitUntilAsync(() => probe.attempts >= 3);
    expect(getQueuePositions(client)).toEqual([waitMessage('waiting')]);
    expect(fixture.runners.get(OPERATION_A)?.runCount).toBe(0);

    probe.free();
    await expect(result).resolves.toMatchObject({ exitCode: 0, outcome: 'success' });
    expect(fixture.runners.get(OPERATION_A)?.runCount).toBe(1);
    expect(probe.acquisitions).toBe(1);
    expect(getQueuePositions(client)).toEqual([waitMessage('waiting')]);
  });

  it('fails a request whose wait timeout runs out, while the rest of its batch waits on', async () => {
    const fixture: ITestRoutingFixture = createFixture();
    const probe: ExecutionLeaseProbe = new ExecutionLeaseProbe(fixture);
    const router: PhasedRequestRouter = new PhasedRequestRouter(fixture.session);
    const short: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createRequest('short', { waitTimeoutMs: 300 }),
      new TestPhasedRequestClient('one')
    );
    const long: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createRequest('long', { waitTimeoutMs: 30_000 }),
      new TestPhasedRequestClient('two')
    );
    await expect(short).resolves.toMatchObject({
      admissionErrorCode: 'wait-timeout',
      exitCode: 1,
      errorMessage: expect.stringMatching(
        new RegExp(
          `^The request was not admitted within its 300ms wait timeout while waiting for .* ${LOCK_RELEASED}`
        )
      )
    });
    const attempts: number = probe.attempts;
    await waitUntilAsync(() => probe.attempts > attempts);
    expect(fixture.runners.get(OPERATION_A)?.runCount).toBe(0);

    probe.free();
    await expect(long).resolves.toMatchObject({ exitCode: 0, outcome: 'success' });
    expect(fixture.runners.get(OPERATION_A)?.runCount).toBe(1);
  });

  it('tries the lock again for the batch when the first of its wait timeouts runs out', async () => {
    jest.useFakeTimers();
    try {
      const fixture: ITestRoutingFixture = createFixture();
      const probe: ExecutionLeaseProbe = new ExecutionLeaseProbe(fixture);
      const router: PhasedRequestRouter = new PhasedRequestRouter(fixture.session);
      const longClient: TestPhasedRequestClient = new TestPhasedRequestClient('two');
      const short: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
        createRequest('short', { waitTimeoutMs: 100 }),
        new TestPhasedRequestClient('one')
      );
      const long: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
        createRequest('long', { waitTimeoutMs: 30_000 }),
        longClient
      );
      const isShortSettled: () => boolean = trackSettled(short);
      const isLongSettled: () => boolean = trackSettled(long);
      // Both requests wait in one batch, which has tried the lock once. The long request would try it again in
      // 250ms, but the wait timeout of the short one runs out in 100ms.
      await settleUntilAsync(() => getQueuePositions(longClient).length > 0);
      expect(probe.attempts).toBe(1);

      await jest.advanceTimersByTimeAsync(99);
      expect(probe.attempts).toBe(1);
      await jest.advanceTimersByTimeAsync(1);
      await settleUntilAsync(isShortSettled);
      expect(probe.attempts).toBe(2);
      await expect(short).resolves.toMatchObject({ admissionErrorCode: 'wait-timeout', exitCode: 1 });

      probe.free();
      await jest.advanceTimersByTimeAsync(250);
      await settleUntilAsync(isLongSettled);
      await expect(long).resolves.toMatchObject({ exitCode: 0, outcome: 'success' });
      expect(probe.attempts).toBe(3);
    } finally {
      jest.useRealTimers();
    }
  });

  it('tells a request that joins the waiting batch about the wait, and runs both requests together', async () => {
    const fixture: ITestRoutingFixture = createFixture();
    const probe: ExecutionLeaseProbe = new ExecutionLeaseProbe(fixture);
    const router: PhasedRequestRouter = new PhasedRequestRouter(fixture.session);
    const first: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createRequest('first', { waitTimeoutMs: 30_000 }),
      new TestPhasedRequestClient('one')
    );
    await waitUntilAsync(() => probe.attempts >= 2);
    const joiningClient: TestPhasedRequestClient = new TestPhasedRequestClient('two');
    const joining: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createRequest('joining', { waitTimeoutMs: 30_000 }),
      joiningClient
    );
    await waitUntilAsync(() => getQueuePositions(joiningClient).length > 0);
    expect(getQueuePositions(joiningClient)).toEqual([waitMessage('joining')]);

    probe.free();
    await expect(first).resolves.toMatchObject({ exitCode: 0 });
    await expect(joining).resolves.toMatchObject({ exitCode: 0 });
    expect(probe.acquisitions).toBe(1);
    expect(fixture.runners.get(OPERATION_A)?.runCount).toBe(1);
  });

  it('answers a request that is cancelled while it waits, never runs it, and stops trying the lock', async () => {
    const fixture: ITestRoutingFixture = createFixture();
    const probe: ExecutionLeaseProbe = new ExecutionLeaseProbe(fixture);
    const client: TestPhasedRequestClient = new TestPhasedRequestClient('one');
    const result: Promise<IDaemonPhasedRequestResult> = new PhasedRequestRouter(fixture.session).executeAsync(
      createRequest('cancelled', { waitTimeoutMs: 30_000 }),
      client
    );
    await waitUntilAsync(() => probe.attempts >= 2);
    client.abortController.abort();
    await expect(result).resolves.toMatchObject({
      aborted: true,
      admissionErrorCode: 'aborted',
      outcome: 'aborted'
    });
    const attempts: number = probe.attempts;
    probe.free();
    await new Promise<void>((resolve) => setTimeout(resolve, 600));
    expect(probe.attempts).toBe(attempts);
    expect(fixture.runners.get(OPERATION_A)?.runCount).toBe(0);
  });

  it('answers a request that leaves the waiting batch only once, while the rest of the batch waits on', async () => {
    const fixture: ITestRoutingFixture = createFixture();
    const probe: ExecutionLeaseProbe = new ExecutionLeaseProbe(fixture);
    const router: PhasedRequestRouter = new PhasedRequestRouter(fixture.session);
    const leavingClient: TestPhasedRequestClient = new TestPhasedRequestClient('one');
    const stayingClient: TestPhasedRequestClient = new TestPhasedRequestClient('two');
    let allowResult!: () => void;
    const resultAllowed: Promise<void> = new Promise<void>((resolve) => (allowResult = resolve));
    // The client takes its result slowly, so the batch tries the lock again before the client has it.
    leavingClient.onWriteAsync = async ({ result }: ITestClientWrite): Promise<void> => {
      if (result) await resultAllowed;
    };
    const leaving: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createRequest('leaving', { waitTimeoutMs: 30_000 }),
      leavingClient
    );
    const staying: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createRequest('staying', { waitTimeoutMs: 30_000 }),
      stayingClient
    );
    await waitUntilAsync(() => getQueuePositions(stayingClient).length > 0);
    leavingClient.abortController.abort();
    const attempts: number = probe.attempts;
    await waitUntilAsync(() => probe.attempts >= attempts + 2);
    allowResult();
    await expect(leaving).resolves.toMatchObject({ aborted: true, outcome: 'aborted' });

    probe.free();
    await expect(staying).resolves.toMatchObject({ exitCode: 0, outcome: 'success' });
    expect(fixture.runners.get(OPERATION_A)?.runCount).toBe(1);
    expect(leavingClient.writes.filter(({ result }: ITestClientWrite) => result)).toHaveLength(1);
    expect(getQueuePositions(leavingClient)).toEqual([waitMessage('leaving')]);
  });

  unixIt('fails at once when the daemon holds the lock itself, as waiting would not end', async () => {
    const fixture: ITestRoutingFixture = createFixture();
    const probe: ExecutionLeaseProbe = new ExecutionLeaseProbe(fixture);
    const lockFolder: string = useLockFolder(fixture, 'daemon-holds-lock');
    const lock: LockFile | undefined = LockFile.tryAcquire(lockFolder, 'rush');
    expect(lock).toBeDefined();
    try {
      const client: TestPhasedRequestClient = new TestPhasedRequestClient('one');
      await expect(
        new PhasedRequestRouter(fixture.session).executeAsync(
          createRequest('in-process', { waitTimeoutMs: 2_000 }),
          client
        )
      ).rejects.toBeInstanceOf(PhasedCommandEngineBusyError);
      expect(probe.attempts).toBe(1);
      expect(getQueuePositions(client)).toEqual([]);
      expect(fixture.runners.get(OPERATION_A)?.runCount).toBe(0);
    } finally {
      lock?.release();
    }
  });
});
