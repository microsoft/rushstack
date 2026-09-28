// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { setTimeout as delayAsync } from 'node:timers/promises';

import type {
  IDaemonRequestAdmissionOptions,
  IDaemonRequestQueuePositionMessage
} from '@rushstack/rush-daemon-protocol';

import { RequestSchedulerError, RequestSchedulerErrorCode } from '../RequestScheduler';
import { RequestAdmissionController } from '../WorkspaceRequestAdmission';
import {
  WorkspaceRestartArbiter,
  type IWorkspaceRestartTicket,
  type IWorkspaceRestartTicketOptions
} from '../WorkspaceRestartArbiter';

interface IDrainTest {
  readonly admission: RequestAdmissionController;
  readonly arbiter: WorkspaceRestartArbiter;
  readonly serving: IWorkspaceRestartTicket;
  readonly ticket: IWorkspaceRestartTicket;
}

/** A restart candidate with the given admission options, and one other request that the daemon is serving. */
function createDrainTest(
  options: IDaemonRequestAdmissionOptions,
  servingOptions?: IWorkspaceRestartTicketOptions
): IDrainTest {
  const arbiter: WorkspaceRestartArbiter = new WorkspaceRestartArbiter();
  const serving: IWorkspaceRestartTicket = arbiter.enter(servingOptions);
  const ticket: IWorkspaceRestartTicket = arbiter.enter();
  const admission: RequestAdmissionController = new RequestAdmissionController({
    admission: options,
    client: { abortSignal: new AbortController().signal },
    requestId: 'restart-candidate'
  });
  return { admission, arbiter, serving, ticket };
}

async function isSettledAsync(promise: Promise<unknown>): Promise<boolean> {
  let settled: boolean = false;
  void promise.then(
    () => (settled = true),
    () => (settled = true)
  );
  await new Promise((resolve) => setImmediate(resolve));
  return settled;
}

describe('RequestAdmissionController.waitForRestartDrainAsync', () => {
  it('waits past a client-default timeout, and the wait does not count against it', async () => {
    const { admission, arbiter, serving, ticket } = createDrainTest({
      waitTimeoutMs: 50,
      waitTimeoutIsDefault: true
    });
    const draining: Promise<void> = admission.waitForRestartDrainAsync(arbiter, ticket);
    await delayAsync(250);
    expect(await isSettledAsync(draining)).toBe(false);
    arbiter.leave(serving);
    await draining;
    // The later admission steps keep what was left of the default when the drain began.
    expect(admission.remainingAdmission).toMatchObject({ waitTimeoutIsDefault: true });
    expect(admission.remainingAdmission?.waitTimeoutMs).toBeGreaterThan(0);
    arbiter.leave(ticket);
    admission.dispose();
    expect(arbiter.servingCount).toBe(0);
  });

  it('still applies a client-default timeout while it waits for a rushx script, and says why', async () => {
    const { admission, arbiter, serving, ticket } = createDrainTest(
      { waitTimeoutMs: 50, waitTimeoutIsDefault: true },
      { runsScript: true }
    );
    const error: unknown = await admission
      .waitForRestartDrainAsync(arbiter, ticket)
      .catch((caught: unknown) => caught);
    expect((error as RequestSchedulerError).code).toBe(RequestSchedulerErrorCode.WaitTimeout);
    expect((error as Error).message).toContain(
      'including a rushx script that may not exit until it is stopped'
    );
    arbiter.leave(ticket);
    arbiter.leave(serving);
    admission.dispose();
    expect(arbiter.servingCount).toBe(0);
  });

  it('applies a client-default timeout to requests that arrive during the drain, once earlier ones finish', async () => {
    const { admission, arbiter, serving, ticket } = createDrainTest({
      waitTimeoutMs: 50,
      waitTimeoutIsDefault: true
    });
    const draining: Promise<void> = admission.waitForRestartDrainAsync(arbiter, ticket);
    const late: IWorkspaceRestartTicket = arbiter.enter();
    await delayAsync(150);
    expect(await isSettledAsync(draining)).toBe(false);
    arbiter.leave(serving);
    const error: unknown = await draining.catch((caught: unknown) => caught);
    expect((error as RequestSchedulerError).code).toBe(RequestSchedulerErrorCode.WaitTimeout);
    arbiter.leave(ticket);
    arbiter.leave(late);
    admission.dispose();
    expect(arbiter.servingCount).toBe(0);
  });

  it('applies an explicit timeout to the drain, and suggests only --wait-timeout', async () => {
    const { admission, arbiter, serving, ticket } = createDrainTest({ waitTimeoutMs: 50 });
    const error: unknown = await admission
      .waitForRestartDrainAsync(arbiter, ticket)
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(RequestSchedulerError);
    expect((error as RequestSchedulerError).code).toBe(RequestSchedulerErrorCode.WaitTimeout);
    // Setting the environment variable instead would itself restart the daemon.
    expect((error as Error).message).toContain('--wait-timeout <seconds>');
    expect((error as Error).message).not.toContain('RUSH_DAEMON_QUEUE_TIMEOUT_SECONDS');
    arbiter.leave(ticket);
    arbiter.leave(serving);
    admission.dispose();
    expect(arbiter.servingCount).toBe(0);
  });

  it('spends an explicit timeout while it waits for the drain, but not on the work around that wait', async () => {
    const { admission, arbiter, serving, ticket } = createDrainTest({ waitTimeoutMs: 10_000 });
    // Such as capturing the request's inputs before the wait, and planning the restart after it.
    await delayAsync(1_000);
    const draining: Promise<void> = admission.waitForRestartDrainAsync(arbiter, ticket);
    await delayAsync(300);
    arbiter.leave(serving);
    await draining;
    await delayAsync(1_000);
    const remainingMs: number | undefined = admission.remainingAdmission?.waitTimeoutMs;
    expect(remainingMs).toBeLessThanOrEqual(9_710);
    expect(remainingMs).toBeGreaterThan(8_700);
    arbiter.leave(ticket);
    admission.dispose();
    expect(arbiter.servingCount).toBe(0);
  });

  it('applies no-wait to the drain', async () => {
    const { admission, arbiter, serving, ticket } = createDrainTest({ noWait: true });
    const error: unknown = await admission
      .waitForRestartDrainAsync(arbiter, ticket)
      .catch((caught: unknown) => caught);
    expect((error as RequestSchedulerError).code).toBe(RequestSchedulerErrorCode.NoWait);
    arbiter.leave(ticket);
    arbiter.leave(serving);
    admission.dispose();
    expect(arbiter.servingCount).toBe(0);
  });
});

interface IPendingRestartTest {
  readonly admission: RequestAdmissionController;
  readonly arbiter: WorkspaceRestartArbiter;
  readonly candidate: IWorkspaceRestartTicket;
  readonly draining: Promise<number>;
  readonly positions: number[];
  readonly script: IWorkspaceRestartTicket;
  readonly serving: IWorkspaceRestartTicket;
}

/** A rushx script with the given admission options, which arrives while a restart candidate drains one request. */
function createPendingRestartTest(
  options: IDaemonRequestAdmissionOptions,
  servingOptions?: IWorkspaceRestartTicketOptions
): IPendingRestartTest {
  const arbiter: WorkspaceRestartArbiter = new WorkspaceRestartArbiter();
  const serving: IWorkspaceRestartTicket = arbiter.enter(servingOptions);
  const candidate: IWorkspaceRestartTicket = arbiter.enter();
  const draining: Promise<number> = arbiter.waitForDrainAsync(candidate, {
    abortSignal: new AbortController().signal,
    noWait: undefined,
    waitTimeoutMs: undefined
  });
  const script: IWorkspaceRestartTicket = arbiter.enter({ runsScript: true });
  const positions: number[] = [];
  const admission: RequestAdmissionController = new RequestAdmissionController({
    admission: options,
    client: {
      abortSignal: new AbortController().signal,
      supportsRequestAdmission: true,
      writeQueuePositionAsync: (message: IDaemonRequestQueuePositionMessage) => {
        positions.push(message.payload.position);
        return Promise.resolve();
      }
    },
    requestId: 'rushx-script'
  });
  return { admission, arbiter, candidate, draining, positions, script, serving };
}

async function finishPendingRestartTestAsync(test: IPendingRestartTest): Promise<void> {
  test.arbiter.leave(test.serving);
  test.arbiter.leave(test.script);
  await test.draining;
  test.arbiter.leave(test.candidate);
  test.admission.dispose();
  expect(test.arbiter.servingCount).toBe(0);
}

describe('RequestAdmissionController.waitForPendingRestartAsync', () => {
  it('waits past a client-default timeout while the restart drains an earlier build, and reports a position', async () => {
    const test: IPendingRestartTest = createPendingRestartTest({
      waitTimeoutMs: 50,
      waitTimeoutIsDefault: true
    });
    const waiting: Promise<void> = test.admission.waitForPendingRestartAsync(test.arbiter, test.script);
    await delayAsync(250);
    expect(await isSettledAsync(waiting)).toBe(false);
    test.arbiter.leave(test.serving);
    await test.draining;
    test.arbiter.leave(test.candidate);
    await waiting;
    // The build and the candidate, then the candidate alone.
    expect(test.positions).toEqual([2, 1]);
    // The script is then told to run on the successor, which gets its default again.
    expect(test.admission.remainingAdmission?.waitTimeoutMs).toBeGreaterThan(0);
    await finishPendingRestartTestAsync(test);
  });

  it('applies a client-default timeout while a rushx script is served, and says why', async () => {
    const test: IPendingRestartTest = createPendingRestartTest(
      { waitTimeoutMs: 50, waitTimeoutIsDefault: true },
      { runsScript: true }
    );
    const error: unknown = await test.admission
      .waitForPendingRestartAsync(test.arbiter, test.script)
      .catch((caught: unknown) => caught);
    expect((error as RequestSchedulerError).code).toBe(RequestSchedulerErrorCode.WaitTimeout);
    expect((error as Error).message).toContain(
      'A script waits for a pending restart so that the restart does not wait for the script'
    );
    expect((error as Error).message).toContain(
      'including a rushx script that may not exit until it is stopped'
    );
    await finishPendingRestartTestAsync(test);
  });

  it('applies an explicit timeout while the restart drains an earlier build', async () => {
    const test: IPendingRestartTest = createPendingRestartTest({ waitTimeoutMs: 50 });
    const error: unknown = await test.admission
      .waitForPendingRestartAsync(test.arbiter, test.script)
      .catch((caught: unknown) => caught);
    expect((error as RequestSchedulerError).code).toBe(RequestSchedulerErrorCode.WaitTimeout);
    expect((error as Error).message).not.toContain('including a rushx script');
    await finishPendingRestartTestAsync(test);
  });

  it('applies no-wait at once', async () => {
    const test: IPendingRestartTest = createPendingRestartTest({ noWait: true });
    const error: unknown = await test.admission
      .waitForPendingRestartAsync(test.arbiter, test.script)
      .catch((caught: unknown) => caught);
    expect((error as RequestSchedulerError).code).toBe(RequestSchedulerErrorCode.NoWait);
    expect(test.positions).toEqual([]);
    await finishPendingRestartTestAsync(test);
  });
});
