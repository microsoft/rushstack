// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { setTimeout as delayAsync } from 'node:timers/promises';

import type { IDaemonRequestAdmissionOptions } from '@rushstack/rush-daemon-protocol';

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
