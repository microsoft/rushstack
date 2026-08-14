// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ReporterMultiplexer } from '../manager/ReporterMultiplexer';
import type { IReporter, IReporterContext } from '../manager/IReporter';
import type { IReporterEventEnvelope } from '../events/IReporterEventEnvelope';

class FakeReporter implements IReporter {
  public readonly name: string;
  public initCount: number = 0;
  public reportCount: number = 0;
  public flushCount: number = 0;
  public closeCount: number = 0;
  public throwOnInit: boolean = false;
  public throwOnReport: boolean = false;
  public throwOnFlush: boolean = false;
  public throwOnClose: boolean = false;

  public constructor(name: string) {
    this.name = name;
  }

  public async initializeAsync(context: IReporterContext): Promise<void> {
    this.initCount++;
    if (this.throwOnInit) {
      throw new Error(`init failed: ${this.name}`);
    }
  }

  public report(event: IReporterEventEnvelope<unknown>): void {
    this.reportCount++;
    if (this.throwOnReport) {
      throw new Error(`report failed: ${this.name}`);
    }
  }

  public async flushAsync(): Promise<void> {
    this.flushCount++;
    if (this.throwOnFlush) {
      throw new Error(`flush failed: ${this.name}`);
    }
  }

  public async closeAsync(): Promise<void> {
    this.closeCount++;
    if (this.throwOnClose) {
      throw new Error(`close failed: ${this.name}`);
    }
  }
}

function makeEvent(): IReporterEventEnvelope<unknown> {
  return {
    protocolVersion: { major: 1, minor: 0 },
    eventId: 'evt_1',
    sessionId: 'sess',
    sequence: 1,
    timestamp: '2026-01-01T00:00:00.000Z',
    source: { packageName: '@microsoft/rush-lib', packageVersion: '5.177.2' },
    privacy: 'public',
    required: false,
    type: 'activityChanged',
    payload: {}
  };
}

const CONTEXT: IReporterContext = { protocolVersion: { major: 1, minor: 0 } };

describe('ReporterMultiplexer', () => {
  describe('report', () => {
    it('delivers events to every child, isolating a throwing child, when at least one child succeeds', () => {
      const ok1: FakeReporter = new FakeReporter('ok1');
      const bad: FakeReporter = new FakeReporter('bad');
      bad.throwOnReport = true;
      const ok2: FakeReporter = new FakeReporter('ok2');
      const multiplexer: ReporterMultiplexer = new ReporterMultiplexer('mux', [ok1, bad, ok2]);

      expect(() => multiplexer.report(makeEvent())).not.toThrow();

      expect(ok1.reportCount).toBe(1);
      expect(bad.reportCount).toBe(1);
      expect(ok2.reportCount).toBe(1);
    });

    it('still calls every remaining child after an earlier child throws', () => {
      const bad1: FakeReporter = new FakeReporter('bad1');
      bad1.throwOnReport = true;
      const ok: FakeReporter = new FakeReporter('ok');
      const bad2: FakeReporter = new FakeReporter('bad2');
      bad2.throwOnReport = true;
      const multiplexer: ReporterMultiplexer = new ReporterMultiplexer('mux', [bad1, ok, bad2]);

      multiplexer.report(makeEvent());

      expect(bad1.reportCount).toBe(1);
      expect(ok.reportCount).toBe(1);
      expect(bad2.reportCount).toBe(1);
    });

    it('throws when every child fails', () => {
      const bad1: FakeReporter = new FakeReporter('bad1');
      bad1.throwOnReport = true;
      const bad2: FakeReporter = new FakeReporter('bad2');
      bad2.throwOnReport = true;
      const multiplexer: ReporterMultiplexer = new ReporterMultiplexer('mux', [bad1, bad2]);

      expect(() => multiplexer.report(makeEvent())).toThrow();
      expect(bad1.reportCount).toBe(1);
      expect(bad2.reportCount).toBe(1);
    });

    it('does not throw for a multiplexer with no children', () => {
      const multiplexer: ReporterMultiplexer = new ReporterMultiplexer('mux', []);
      expect(() => multiplexer.report(makeEvent())).not.toThrow();
    });
  });

  describe('flushAsync', () => {
    it('flushes every child even if one rejects, then rethrows', async () => {
      const ok1: FakeReporter = new FakeReporter('ok1');
      const bad: FakeReporter = new FakeReporter('bad');
      bad.throwOnFlush = true;
      const ok2: FakeReporter = new FakeReporter('ok2');
      const multiplexer: ReporterMultiplexer = new ReporterMultiplexer('mux', [ok1, bad, ok2]);

      await expect(multiplexer.flushAsync()).rejects.toThrow();

      expect(ok1.flushCount).toBe(1);
      expect(bad.flushCount).toBe(1);
      expect(ok2.flushCount).toBe(1);
    });

    it('does not throw when every child flushes successfully', async () => {
      const ok1: FakeReporter = new FakeReporter('ok1');
      const ok2: FakeReporter = new FakeReporter('ok2');
      const multiplexer: ReporterMultiplexer = new ReporterMultiplexer('mux', [ok1, ok2]);

      await expect(multiplexer.flushAsync()).resolves.toBeUndefined();
    });
  });

  describe('closeAsync', () => {
    it('closes every child even if one rejects, then rethrows', async () => {
      const ok1: FakeReporter = new FakeReporter('ok1');
      const bad: FakeReporter = new FakeReporter('bad');
      bad.throwOnClose = true;
      const ok2: FakeReporter = new FakeReporter('ok2');
      const multiplexer: ReporterMultiplexer = new ReporterMultiplexer('mux', [ok1, bad, ok2]);

      await expect(multiplexer.closeAsync()).rejects.toThrow();

      expect(ok1.closeCount).toBe(1);
      expect(bad.closeCount).toBe(1);
      expect(ok2.closeCount).toBe(1);
    });

    it('is idempotent per child when called more than once', async () => {
      const ok1: FakeReporter = new FakeReporter('ok1');
      const ok2: FakeReporter = new FakeReporter('ok2');
      const multiplexer: ReporterMultiplexer = new ReporterMultiplexer('mux', [ok1, ok2]);

      await multiplexer.closeAsync();
      await multiplexer.closeAsync();

      expect(ok1.closeCount).toBe(2);
      expect(ok2.closeCount).toBe(2);
    });
  });

  describe('initializeAsync', () => {
    it('initializes every child in order when all succeed', async () => {
      const order: string[] = [];
      const first: FakeReporter = new FakeReporter('first');
      const second: FakeReporter = new FakeReporter('second');
      const multiplexer: ReporterMultiplexer = new ReporterMultiplexer('mux', [first, second]);

      const originalFirstInit: (context: IReporterContext) => Promise<void> =
        first.initializeAsync.bind(first);
      first.initializeAsync = async (context: IReporterContext): Promise<void> => {
        order.push('first');
        await originalFirstInit(context);
      };
      const originalSecondInit: (context: IReporterContext) => Promise<void> =
        second.initializeAsync.bind(second);
      second.initializeAsync = async (context: IReporterContext): Promise<void> => {
        order.push('second');
        await originalSecondInit(context);
      };

      await multiplexer.initializeAsync(CONTEXT);

      expect(order).toEqual(['first', 'second']);
      expect(first.initCount).toBe(1);
      expect(second.initCount).toBe(1);
    });

    it('rolls back already-initialized children and rethrows when a later child fails', async () => {
      const first: FakeReporter = new FakeReporter('first');
      const second: FakeReporter = new FakeReporter('second');
      second.throwOnInit = true;
      const third: FakeReporter = new FakeReporter('third');
      const multiplexer: ReporterMultiplexer = new ReporterMultiplexer('mux', [first, second, third]);

      await expect(multiplexer.initializeAsync(CONTEXT)).rejects.toThrow(/init failed: second/);

      expect(first.initCount).toBe(1);
      expect(first.closeCount).toBe(1);
      expect(second.initCount).toBe(1);
      expect(second.closeCount).toBe(0);
      expect(third.initCount).toBe(0);
      expect(third.closeCount).toBe(0);
    });

    it('does not let a rollback close failure mask the original initialization error', async () => {
      const first: FakeReporter = new FakeReporter('first');
      first.throwOnClose = true;
      const second: FakeReporter = new FakeReporter('second');
      second.throwOnInit = true;
      const multiplexer: ReporterMultiplexer = new ReporterMultiplexer('mux', [first, second]);

      await expect(multiplexer.initializeAsync(CONTEXT)).rejects.toThrow(/init failed: second/);
      expect(first.closeCount).toBe(1);
    });
  });
});
