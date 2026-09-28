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

function expectWaitTimeout(error: unknown): RequestSchedulerError {
  expect(error).toBeInstanceOf(RequestSchedulerError);
  expect((error as RequestSchedulerError).code).toBe(RequestSchedulerErrorCode.WaitTimeout);
  return error as RequestSchedulerError;
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

  describe('for a rushx script while a restart is pending', () => {
    const WAIVED: IWorkspaceRestartDrainOptions = {
      ...WAIT,
      waitTimeoutMs: 50,
      waivesTimeoutForServedWork: true
    };

    it('reports a restart as pending from the start of its drain until the candidate leaves', async () => {
      const arbiter: WorkspaceRestartArbiter = new WorkspaceRestartArbiter();
      const running: IWorkspaceRestartTicket = arbiter.enter({ runsScript: true });
      const candidate: IWorkspaceRestartTicket = arbiter.enter();
      expect(arbiter.hasPendingRestart(running)).toBe(false);
      const draining: Promise<number> = arbiter.waitForDrainAsync(candidate, WAIT);
      expect(arbiter.hasPendingRestart(running)).toBe(true);
      expect(arbiter.hasPendingRestart(candidate)).toBe(false);
      arbiter.leave(running);
      await draining;
      // After its drain, the candidate still waits for #gate and plans the restart, so a new script must not start.
      const script: IWorkspaceRestartTicket = arbiter.enter({ runsScript: true });
      expect(arbiter.hasPendingRestart(script)).toBe(true);
      arbiter.leave(candidate);
      expect(arbiter.hasPendingRestart(script)).toBe(false);
      arbiter.leave(script);
      expect(arbiter.servingCount).toBe(0);
    });

    it('proceeds immediately when no restart is pending', async () => {
      const arbiter: WorkspaceRestartArbiter = new WorkspaceRestartArbiter();
      const serving: IWorkspaceRestartTicket = arbiter.enter();
      const script: IWorkspaceRestartTicket = arbiter.enter({ runsScript: true });
      const counts: number[] = [];
      const waivedMs: number = await arbiter.waitForPendingRestartAsync(script, {
        ...WAIT,
        noWait: true,
        onServingCountChanged: (count: number) => counts.push(count)
      });
      expect(waivedMs).toBe(0);
      expect(counts).toEqual([]);
      expect(arbiter.servingCount).toBe(2);
      for (const served of [script, serving]) arbiter.leave(served);
      expect(arbiter.servingCount).toBe(0);
    });

    it('waits until the candidate leaves, and the drain does not wait for the waiting script', async () => {
      const arbiter: WorkspaceRestartArbiter = new WorkspaceRestartArbiter();
      const running: IWorkspaceRestartTicket = arbiter.enter({ runsScript: true });
      const candidate: IWorkspaceRestartTicket = arbiter.enter();
      const draining: Promise<number> = arbiter.waitForDrainAsync(candidate, WAIT);
      const script: IWorkspaceRestartTicket = arbiter.enter({ runsScript: true });
      const counts: number[] = [];
      const waiting: Promise<number> = arbiter.waitForPendingRestartAsync(script, {
        ...WAIT,
        onServingCountChanged: (count: number) => counts.push(count)
      });
      // The script waits for the running script and for the candidate.
      expect(counts).toEqual([2]);
      arbiter.leave(running);
      await draining;
      expect(counts).toEqual([2, 1]);
      expect(await isSettledAsync(waiting)).toBe(false);
      arbiter.leave(candidate);
      expect(await waiting).toBe(0);
      expect(arbiter.servingCount).toBe(1);
      arbiter.leave(script);
      expect(arbiter.servingCount).toBe(0);
    });

    it('waits for every pending restart', async () => {
      const arbiter: WorkspaceRestartArbiter = new WorkspaceRestartArbiter();
      const running: IWorkspaceRestartTicket = arbiter.enter({ runsScript: true });
      const first: IWorkspaceRestartTicket = arbiter.enter();
      const second: IWorkspaceRestartTicket = arbiter.enter();
      const firstDrain: Promise<number> = arbiter.waitForDrainAsync(first, WAIT);
      const secondDrain: Promise<number> = arbiter.waitForDrainAsync(second, WAIT);
      const script: IWorkspaceRestartTicket = arbiter.enter({ runsScript: true });
      const waiting: Promise<number> = arbiter.waitForPendingRestartAsync(script, WAIT);
      arbiter.leave(running);
      await firstDrain;
      arbiter.leave(first);
      await secondDrain;
      expect(await isSettledAsync(waiting)).toBe(false);
      arbiter.leave(second);
      await waiting;
      arbiter.leave(script);
      expect(arbiter.servingCount).toBe(0);
    });

    it.each([
      ['no-wait', RequestSchedulerErrorCode.NoWait, 'the rushx script did not wait for the restart.'],
      [
        'timeout',
        RequestSchedulerErrorCode.WaitTimeout,
        "The rushx script was not admitted before the daemon could restart for another request's environment. " +
          'A script waits for a pending restart so that the restart does not wait for the script, and the ' +
          'restart waits for the requests that the daemon is serving to finish, including a rushx script that ' +
          'may not exit until it is stopped. Stop the script, or use --wait-timeout <seconds> to wait longer.'
      ],
      ['abort', RequestSchedulerErrorCode.Aborted, 'The request was aborted before execution.']
    ])(
      'reports %s as an admission failure and counts the script as served again',
      async (mode, code, text) => {
        const arbiter: WorkspaceRestartArbiter = new WorkspaceRestartArbiter();
        const running: IWorkspaceRestartTicket = arbiter.enter({ runsScript: true });
        const candidate: IWorkspaceRestartTicket = arbiter.enter();
        const draining: Promise<number> = arbiter.waitForDrainAsync(candidate, WAIT);
        const script: IWorkspaceRestartTicket = arbiter.enter({ runsScript: true });
        const abort: AbortController = new AbortController();
        const waiting: Promise<number> = arbiter.waitForPendingRestartAsync(script, {
          abortSignal: abort.signal,
          noWait: mode === 'no-wait' ? true : undefined,
          waitTimeoutMs: mode === 'timeout' ? 10 : undefined
        });
        if (mode === 'abort') abort.abort();
        const error: unknown = await waiting.catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(RequestSchedulerError);
        expect((error as RequestSchedulerError).code).toBe(code);
        expect((error as Error).message).toContain(text);
        expect(arbiter.servingCount).toBe(2);
        arbiter.leave(running);
        expect(await isSettledAsync(draining)).toBe(false);
        arbiter.leave(script);
        await draining;
        arbiter.leave(candidate);
        expect(arbiter.servingCount).toBe(0);
      }
    );

    it('with waivesTimeoutForServedWork, does not spend the timeout while an earlier build is served', async () => {
      const arbiter: WorkspaceRestartArbiter = new WorkspaceRestartArbiter();
      const earlier: IWorkspaceRestartTicket = arbiter.enter();
      const candidate: IWorkspaceRestartTicket = arbiter.enter();
      const draining: Promise<number> = arbiter.waitForDrainAsync(candidate, WAIT);
      const script: IWorkspaceRestartTicket = arbiter.enter({ runsScript: true });
      const waiting: Promise<number> = arbiter.waitForPendingRestartAsync(script, WAIVED);
      await delayAsync(150);
      expect(await isSettledAsync(waiting)).toBe(false);
      arbiter.leave(earlier);
      await draining;
      arbiter.leave(candidate);
      expect(await waiting).toBeGreaterThanOrEqual(140);
      arbiter.leave(script);
      expect(arbiter.servingCount).toBe(0);
    });

    it('with waivesTimeoutForServedWork, spends the timeout once the drain ends, and names the waived time', async () => {
      const arbiter: WorkspaceRestartArbiter = new WorkspaceRestartArbiter();
      const earlier: IWorkspaceRestartTicket = arbiter.enter();
      const candidate: IWorkspaceRestartTicket = arbiter.enter();
      const draining: Promise<number> = arbiter.waitForDrainAsync(candidate, WAIT);
      const script: IWorkspaceRestartTicket = arbiter.enter({ runsScript: true });
      const outcome: Promise<unknown> = arbiter
        .waitForPendingRestartAsync(script, WAIVED)
        .catch((caught: unknown) => caught);
      await delayAsync(150);
      expect(await isSettledAsync(outcome)).toBe(false);
      arbiter.leave(earlier);
      await draining;
      const error: RequestSchedulerError = expectWaitTimeout(await outcome);
      expect(error.message).toMatch(/^The rushx script was not admitted before the daemon could restart/);
      expect(error.message).toMatch(
        /to finish; \d+(\.\d)?s spent waiting for requests that were already running did not count\. Use --wait-timeout <seconds> to wait longer\.$/
      );
      for (const served of [candidate, script]) arbiter.leave(served);
      expect(arbiter.servingCount).toBe(0);
    });

    it('with waivesTimeoutForServedWork, spends the timeout while a rushx script is served', async () => {
      const arbiter: WorkspaceRestartArbiter = new WorkspaceRestartArbiter();
      const running: IWorkspaceRestartTicket = arbiter.enter({ runsScript: true });
      const earlier: IWorkspaceRestartTicket = arbiter.enter();
      const candidate: IWorkspaceRestartTicket = arbiter.enter();
      const draining: Promise<number> = arbiter.waitForDrainAsync(candidate, WAIT);
      const script: IWorkspaceRestartTicket = arbiter.enter({ runsScript: true });
      const outcome: Promise<unknown> = arbiter
        .waitForPendingRestartAsync(script, WAIVED)
        .catch((caught: unknown) => caught);
      await delayAsync(150);
      expect(await isSettledAsync(outcome)).toBe(true);
      expect(expectWaitTimeout(await outcome).message).toContain('including a rushx script');
      for (const served of [running, earlier, script]) arbiter.leave(served);
      await draining;
      arbiter.leave(candidate);
      expect(arbiter.servingCount).toBe(0);
    });
  });
});
