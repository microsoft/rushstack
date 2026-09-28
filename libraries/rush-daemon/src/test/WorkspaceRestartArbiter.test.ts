// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { setTimeout as delayAsync } from 'node:timers/promises';

import { RequestSchedulerError, RequestSchedulerErrorCode } from '../RequestScheduler';
import {
  WorkspaceRestartArbiter,
  type IWorkspaceRestartDrainOptions,
  type IWorkspaceRestartTicket
} from '../WorkspaceRestartArbiter';

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
    const firstWait: Promise<number> = arbiter.waitForDrainAsync(first, WAIT);
    const secondWait: Promise<number> = arbiter.waitForDrainAsync(second, WAIT);
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
    const waiting: Promise<number> = arbiter.waitForDrainAsync(ticket, {
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

  it('reports how many requests a restart candidate waits for, whenever that number changes', async () => {
    const arbiter: WorkspaceRestartArbiter = new WorkspaceRestartArbiter();
    const first: IWorkspaceRestartTicket = arbiter.enter();
    const second: IWorkspaceRestartTicket = arbiter.enter();
    const candidate: IWorkspaceRestartTicket = arbiter.enter();
    const counts: number[] = [];
    const waiting: Promise<number> = arbiter.waitForDrainAsync(candidate, {
      ...WAIT,
      onServingCountChanged: (count: number) => counts.push(count)
    });
    expect(counts).toEqual([2]);
    const late: IWorkspaceRestartTicket = arbiter.enter();
    arbiter.leave(first);
    arbiter.leave(second);
    expect(counts).toEqual([2, 3, 2, 1]);
    // Another restart candidate stops counting once it waits too; it then waits for the first candidate.
    const other: IWorkspaceRestartTicket = arbiter.enter();
    const otherCounts: number[] = [];
    const otherWaiting: Promise<number> = arbiter.waitForDrainAsync(other, {
      ...WAIT,
      onServingCountChanged: (count: number) => otherCounts.push(count)
    });
    arbiter.leave(late);
    await waiting;
    expect(counts).toEqual([2, 3, 2, 1, 2, 1]);
    expect(await isSettledAsync(otherWaiting)).toBe(false);
    expect(otherCounts).toEqual([1]);
    arbiter.leave(candidate);
    await otherWaiting;
    arbiter.leave(other);
    expect(counts).toHaveLength(6);
    expect(arbiter.servingCount).toBe(0);
  });

  it('reports no count for a candidate that does not wait', async () => {
    const arbiter: WorkspaceRestartArbiter = new WorkspaceRestartArbiter();
    const ticket: IWorkspaceRestartTicket = arbiter.enter();
    const counts: number[] = [];
    await arbiter.waitForDrainAsync(ticket, {
      ...WAIT,
      onServingCountChanged: (count: number) => counts.push(count)
    });
    const serving: IWorkspaceRestartTicket = arbiter.enter();
    const noWait: IWorkspaceRestartTicket = arbiter.enter();
    const error: unknown = await arbiter
      .waitForDrainAsync(noWait, {
        ...WAIT,
        noWait: true,
        onServingCountChanged: (count: number) => counts.push(count)
      })
      .catch((caught: unknown) => caught);
    expect((error as RequestSchedulerError).code).toBe(RequestSchedulerErrorCode.NoWait);
    expect(counts).toEqual([]);
    for (const served of [ticket, serving, noWait]) arbiter.leave(served);
    expect(arbiter.servingCount).toBe(0);
  });

  describe('with waivesTimeoutForServedWork', () => {
    const WAIVED: IWorkspaceRestartDrainOptions = {
      ...WAIT,
      waitTimeoutMs: 50,
      waivesTimeoutForServedWork: true
    };

    function expectWaitTimeout(error: unknown): RequestSchedulerError {
      expect(error).toBeInstanceOf(RequestSchedulerError);
      expect((error as RequestSchedulerError).code).toBe(RequestSchedulerErrorCode.WaitTimeout);
      return error as RequestSchedulerError;
    }

    it('does not spend the timeout on requests served when the wait began, and returns that time', async () => {
      const arbiter: WorkspaceRestartArbiter = new WorkspaceRestartArbiter();
      const earlier: IWorkspaceRestartTicket = arbiter.enter();
      const candidate: IWorkspaceRestartTicket = arbiter.enter();
      const waiting: Promise<number> = arbiter.waitForDrainAsync(candidate, WAIVED);
      await delayAsync(150);
      expect(await isSettledAsync(waiting)).toBe(false);
      arbiter.leave(earlier);
      expect(await waiting).toBeGreaterThanOrEqual(140);
      arbiter.leave(candidate);
      expect(arbiter.servingCount).toBe(0);
    });

    it('spends the timeout on requests that arrived after the wait began, once the earlier ones finish', async () => {
      const arbiter: WorkspaceRestartArbiter = new WorkspaceRestartArbiter();
      const earlier: IWorkspaceRestartTicket = arbiter.enter();
      const candidate: IWorkspaceRestartTicket = arbiter.enter();
      const waiting: Promise<number> = arbiter.waitForDrainAsync(candidate, WAIVED);
      const late: IWorkspaceRestartTicket = arbiter.enter();
      await delayAsync(150);
      expect(await isSettledAsync(waiting)).toBe(false);
      arbiter.leave(earlier);
      const error: RequestSchedulerError = expectWaitTimeout(
        await waiting.catch((caught: unknown) => caught)
      );
      expect(error.message).not.toContain('rushx');
      expect(error.message).toMatch(
        /to finish; \d+(\.\d)?s spent waiting for requests that were already running did not count\. Use --wait-timeout <seconds> to wait longer\.$/
      );
      for (const served of [candidate, late]) arbiter.leave(served);
      expect(arbiter.servingCount).toBe(0);
    });

    it('spends the timeout on a rushx script, and says that the script may not exit', async () => {
      const arbiter: WorkspaceRestartArbiter = new WorkspaceRestartArbiter();
      const script: IWorkspaceRestartTicket = arbiter.enter({ runsScript: true });
      const candidate: IWorkspaceRestartTicket = arbiter.enter();
      const error: RequestSchedulerError = expectWaitTimeout(
        await arbiter.waitForDrainAsync(candidate, WAIVED).catch((caught: unknown) => caught)
      );
      expect(error.message).toContain(
        ', including a rushx script that may not exit until it is stopped. Stop the script, or use --wait-timeout'
      );
      for (const served of [candidate, script]) arbiter.leave(served);
      expect(arbiter.servingCount).toBe(0);
    });

    it('spends the timeout while a rushx script is served, even next to an earlier build', async () => {
      const arbiter: WorkspaceRestartArbiter = new WorkspaceRestartArbiter();
      const script: IWorkspaceRestartTicket = arbiter.enter({ runsScript: true });
      const earlier: IWorkspaceRestartTicket = arbiter.enter();
      const candidate: IWorkspaceRestartTicket = arbiter.enter();
      const outcome: Promise<unknown> = arbiter
        .waitForDrainAsync(candidate, WAIVED)
        .catch((caught: unknown) => caught);
      await delayAsync(150);
      expect(await isSettledAsync(outcome)).toBe(true);
      expect(expectWaitTimeout(await outcome).message).toContain('including a rushx script');
      for (const served of [candidate, earlier, script]) arbiter.leave(served);
      expect(arbiter.servingCount).toBe(0);
    });

    it('stops spending the timeout when the rushx script exits while an earlier build is served', async () => {
      const arbiter: WorkspaceRestartArbiter = new WorkspaceRestartArbiter();
      const script: IWorkspaceRestartTicket = arbiter.enter({ runsScript: true });
      const earlier: IWorkspaceRestartTicket = arbiter.enter();
      const candidate: IWorkspaceRestartTicket = arbiter.enter();
      const waiting: Promise<number> = arbiter.waitForDrainAsync(candidate, WAIVED);
      arbiter.leave(script);
      await delayAsync(150);
      expect(await isSettledAsync(waiting)).toBe(false);
      arbiter.leave(earlier);
      expect(await waiting).toBeGreaterThanOrEqual(140);
      arbiter.leave(candidate);
      expect(arbiter.servingCount).toBe(0);
    });

    it('spends the timeout once a rushx script arrives during the wait', async () => {
      const arbiter: WorkspaceRestartArbiter = new WorkspaceRestartArbiter();
      const earlier: IWorkspaceRestartTicket = arbiter.enter();
      const candidate: IWorkspaceRestartTicket = arbiter.enter();
      const outcome: Promise<unknown> = arbiter
        .waitForDrainAsync(candidate, WAIVED)
        .catch((caught: unknown) => caught);
      await delayAsync(100);
      expect(await isSettledAsync(outcome)).toBe(false);
      const script: IWorkspaceRestartTicket = arbiter.enter({ runsScript: true });
      await delayAsync(150);
      expect(await isSettledAsync(outcome)).toBe(true);
      expect(expectWaitTimeout(await outcome).message).toMatch(
        /, including a rushx script that may not exit until it is stopped; \d+(\.\d)?s spent waiting for requests that were already running did not count\. Stop the script, or use --wait-timeout/
      );
      for (const served of [candidate, earlier, script]) arbiter.leave(served);
      expect(arbiter.servingCount).toBe(0);
    });

    it('returns 0 when the timeout is not waived', async () => {
      const arbiter: WorkspaceRestartArbiter = new WorkspaceRestartArbiter();
      const earlier: IWorkspaceRestartTicket = arbiter.enter();
      const candidate: IWorkspaceRestartTicket = arbiter.enter();
      const waiting: Promise<number> = arbiter.waitForDrainAsync(candidate, {
        ...WAIT,
        waitTimeoutMs: 5_000
      });
      await delayAsync(20);
      arbiter.leave(earlier);
      expect(await waiting).toBe(0);
      arbiter.leave(candidate);
      expect(arbiter.servingCount).toBe(0);
    });
  });
});
