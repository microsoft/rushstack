// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { RequestSchedulerError, RequestSchedulerErrorCode } from '../RequestScheduler';
import { WorkspaceRestartArbiter, type IWorkspaceRestartTicket } from '../WorkspaceRestartArbiter';

const WAIT: { abortSignal: AbortSignal; noWait: undefined; waitTimeoutMs: undefined } = {
  abortSignal: new AbortController().signal,
  noWait: undefined,
  waitTimeoutMs: undefined
};

async function isSettledAsync(promise: Promise<unknown>): Promise<boolean> {
  let settled: boolean = false;
  void promise.then(
    () => (settled = true),
    () => (settled = true)
  );
  await new Promise((resolve) => setImmediate(resolve));
  return settled;
}

describe(WorkspaceRestartArbiter.name, () => {
  it('proceeds immediately when no other request is being served', async () => {
    const arbiter: WorkspaceRestartArbiter = new WorkspaceRestartArbiter();
    const ticket: IWorkspaceRestartTicket = arbiter.enter();
    await arbiter.waitForDrainAsync(ticket, WAIT);
    expect(arbiter.servingCount).toBe(1);
    arbiter.leave(ticket);
    expect(arbiter.servingCount).toBe(0);
  });

  it('waits for served requests, including ones that arrive later, and admits candidates one at a time', async () => {
    const arbiter: WorkspaceRestartArbiter = new WorkspaceRestartArbiter();
    const serving: IWorkspaceRestartTicket = arbiter.enter();
    const first: IWorkspaceRestartTicket = arbiter.enter();
    const second: IWorkspaceRestartTicket = arbiter.enter();
    const firstWait: Promise<void> = arbiter.waitForDrainAsync(first, WAIT);
    const secondWait: Promise<void> = arbiter.waitForDrainAsync(second, WAIT);
    const late: IWorkspaceRestartTicket = arbiter.enter();
    arbiter.leave(serving);
    expect(await isSettledAsync(firstWait)).toBe(false);
    arbiter.leave(late);
    await firstWait;
    expect(await isSettledAsync(secondWait)).toBe(false);
    arbiter.leave(first);
    await secondWait;
    arbiter.leave(second);
    expect(arbiter.servingCount).toBe(0);
  });

  it.each([
    ['no-wait', RequestSchedulerErrorCode.NoWait],
    ['timeout', RequestSchedulerErrorCode.WaitTimeout],
    ['abort', RequestSchedulerErrorCode.Aborted]
  ])('reports %s as an admission failure and restores its accounting', async (mode, code) => {
    const arbiter: WorkspaceRestartArbiter = new WorkspaceRestartArbiter();
    const serving: IWorkspaceRestartTicket = arbiter.enter();
    const ticket: IWorkspaceRestartTicket = arbiter.enter();
    const abort: AbortController = new AbortController();
    const waiting: Promise<void> = arbiter.waitForDrainAsync(ticket, {
      abortSignal: abort.signal,
      noWait: mode === 'no-wait' ? true : undefined,
      waitTimeoutMs: mode === 'timeout' ? 10 : undefined
    });
    if (mode === 'abort') abort.abort();
    const error: unknown = await waiting.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(RequestSchedulerError);
    expect((error as RequestSchedulerError).code).toBe(code);
    expect(arbiter.servingCount).toBe(2);
    arbiter.leave(ticket);
    arbiter.leave(serving);
    expect(arbiter.servingCount).toBe(0);
  });
});