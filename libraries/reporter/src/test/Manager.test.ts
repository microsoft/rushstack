// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  ReporterManager,
  ReporterMultiplexer,
  type IReporter,
  type IReporterContext,
  type IReporterEmitEventInput,
  type IReporterEventEnvelope,
  type ReporterEventType,
  type ReporterJsonValue
} from '../index';

class RecordingReporter implements IReporter {
  public readonly name: string;
  public readonly reported: IReporterEventEnvelope<unknown>[] = [];
  public initCount: number = 0;
  public flushCount: number = 0;
  public closeCount: number = 0;
  public throwOnInit: boolean = false;
  public throwOnReportType: ReporterEventType | undefined = undefined;
  public throwOnClose: boolean = false;

  public constructor(name: string) {
    this.name = name;
  }

  public async initializeAsync(): Promise<void> {
    this.initCount++;
    if (this.throwOnInit) {
      throw new Error(`init failed ${this.name}`);
    }
  }

  public report(event: IReporterEventEnvelope<unknown>): void {
    if (this.throwOnReportType !== undefined && event.type === this.throwOnReportType) {
      throw new Error(`report failed ${this.name}`);
    }
    this.reported.push(event);
  }

  public async flushAsync(): Promise<void> {
    this.flushCount++;
  }

  public async closeAsync(): Promise<void> {
    this.closeCount++;
    if (this.throwOnClose) {
      throw new Error(`close failed ${this.name}`);
    }
  }
}

function makeInput(
  type: ReporterEventType,
  payload: ReporterJsonValue = {}
): IReporterEmitEventInput<ReporterJsonValue> {
  return {
    protocolVersion: { major: 1, minor: 0 },
    sessionId: 'sess',
    source: { packageName: '@microsoft/rush-lib', packageVersion: '5.177.2' },
    privacy: 'public',
    type,
    payload
  };
}

describe('ReporterManager ordering and assignment', () => {
  it.each([new Error('original failure'), 'non-Error original failure'])(
    'aborts attempted initialization synchronously and retains its original reason: %s',
    async (failure) => {
      const manager: ReporterManager = new ReporterManager();
      const contexts: IReporterContext[] = [];
      const closeCounts: number[] = [0, 0, 0];
      let reentrant: Promise<void> | undefined;
      let releaseClose!: () => void;
      let notifyClose!: () => void;
      const closeStarted: Promise<void> = new Promise((resolve) => (notifyClose = resolve));
      const closeFinished: Promise<void> = new Promise((resolve) => (releaseClose = resolve));
      for (const index of [0, 1, 2]) {
        manager.addReporter({
          name: `attempt-${index}`,
          initializeAsync: async (context) => {
            contexts.push(context);
            if (index === 0) {
              context.abortSignal!.addEventListener('abort', () => {
                reentrant = manager._disposeInitializedReportersAsync(failure);
              });
            } else if (index === 1) {
              throw failure;
            }
          },
          report: () => undefined,
          flushAsync: async () => undefined,
          closeAsync: async () => {
            closeCounts[index]++;
            if (index === 0) {
              notifyClose();
              await closeFinished;
            }
          }
        });
      }
      await expect(manager.initializeAsync()).rejects.toBe(failure);
      const disposal: Promise<void> = manager._disposeInitializedReportersAsync(failure);
      expect(reentrant).toBe(disposal);
      expect(contexts).toHaveLength(2);
      for (const context of contexts) {
        expect(context.abortSignal!.aborted).toBe(true);
        if (failure instanceof Error) {
          expect(context.abortSignal!.reason).toBe(failure);
        } else {
          expect(context.abortSignal!.reason).toBeInstanceOf(Error);
          expect(context.abortSignal!.reason.cause).toBe(failure);
        }
      }
      try {
        await closeStarted;
        expect(closeCounts[2]).toBe(0);
      } finally {
        releaseClose();
        await disposal;
      }
      await manager.closeAsync();
      expect(closeCounts).toEqual([1, 1, 0]);
    }
  );

  it('reserves the disposal lifecycle lane before concurrent shutdown can flush or close', async () => {
    const manager: ReporterManager = new ReporterManager();
    const reporter: RecordingReporter = new RecordingReporter('blocked-disposal-flush');
    let notifyFlushStarted!: () => void;
    let finishFlush!: () => void;
    const flushStarted: Promise<void> = new Promise((resolve) => (notifyFlushStarted = resolve));
    const flushFinished: Promise<void> = new Promise((resolve) => (finishFlush = resolve));
    jest.spyOn(reporter, 'flushAsync').mockImplementation(async () => {
      reporter.flushCount++;
      if (reporter.flushCount === 1) {
        notifyFlushStarted();
        await flushFinished;
      }
    });
    manager.addReporter(reporter);
    await manager.initializeAsync();

    const disposing: Promise<void> = manager._disposeInitializedReportersAsync();
    await flushStarted;
    const closing: Promise<void> = manager.closeAsync();
    try {
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(reporter.flushCount).toBe(1);
      expect(reporter.closeCount).toBe(0);
    } finally {
      finishFlush();
      await Promise.all([disposing, closing]);
    }
    expect(reporter.flushCount).toBe(1);
    expect(reporter.closeCount).toBe(1);
  });

  it('shares one close operation between concurrent shutdown and initialization disposal', async () => {
    const manager: ReporterManager = new ReporterManager();
    const reporter: RecordingReporter = new RecordingReporter('shared-close');
    let notifyCloseStarted!: () => void;
    let finishClose!: () => void;
    const closeStarted: Promise<void> = new Promise((resolve) => (notifyCloseStarted = resolve));
    const closeFinished: Promise<void> = new Promise((resolve) => (finishClose = resolve));
    jest.spyOn(reporter, 'closeAsync').mockImplementation(async () => {
      reporter.closeCount++;
      notifyCloseStarted();
      await closeFinished;
    });
    manager.addReporter(reporter);
    await manager.initializeAsync();

    const closing: Promise<void> = manager.closeAsync();
    const disposing: Promise<void> = manager._disposeInitializedReportersAsync();
    await closeStarted;
    expect(reporter.closeCount).toBe(1);
    finishClose();
    await Promise.all([closing, disposing]);
    const flushCount: number = reporter.flushCount;
    await manager.flushAsync();
    await manager.closeAsync();
    expect(reporter.closeCount).toBe(1);
    expect(reporter.flushCount).toBe(flushCount);
  });

  it('caches a rejected close across normal shutdown and disposal without retrying it', async () => {
    const manager: ReporterManager = new ReporterManager({ emergencyDiagnosticWriter: () => undefined });
    const reporter: RecordingReporter = new RecordingReporter('failed-close');
    reporter.throwOnClose = true;
    manager.addReporter(reporter, { required: true });
    await manager.initializeAsync();

    await expect(manager.closeAsync()).rejects.toThrow('close failed failed-close');
    await expect(manager._disposeInitializedReportersAsync()).rejects.toThrow('close failed failed-close');
    await expect(manager.closeAsync()).rejects.toThrow('close failed failed-close');
    expect(reporter.closeCount).toBe(1);
  });

  it('closes attempted initializations even when a prior lifecycle error reporter rejected', async () => {
    const manager: ReporterManager = new ReporterManager({
      emergencyDiagnosticWriter: () => {
        throw new Error('emergency writer failed');
      }
    });
    const reporter: RecordingReporter = new RecordingReporter('lifecycle-failure');
    reporter.flushAsync = async () => {
      throw new Error('flush failed');
    };
    manager.addReporter(reporter);
    await manager.initializeAsync();

    await expect(manager.flushAsync()).rejects.toThrow('emergency writer failed');
    await expect(manager._disposeInitializedReportersAsync()).rejects.toThrow('emergency writer failed');
    expect(reporter.closeCount).toBe(1);
  });

  it('disposes every attempted initialization once without closing unstarted reporters', async () => {
    const manager: ReporterManager = new ReporterManager();
    const first: RecordingReporter = new RecordingReporter('first');
    const failed: RecordingReporter = new RecordingReporter('failed');
    const unstarted: RecordingReporter = new RecordingReporter('unstarted');
    failed.throwOnInit = true;
    first.throwOnClose = true;
    manager.addReporter(first);
    manager.addReporter(failed);
    manager.addReporter(unstarted);

    await expect(manager.initializeAsync()).rejects.toThrow('init failed failed');
    const disposal: Promise<void> = manager._disposeInitializedReportersAsync();
    expect(manager._disposeInitializedReportersAsync()).toBe(disposal);
    await expect(disposal).rejects.toThrow('close failed first');
    expect([first.closeCount, failed.closeCount, unstarted.closeCount]).toEqual([1, 1, 0]);
    expect([first.flushCount, failed.flushCount, unstarted.flushCount]).toEqual([0, 0, 0]);
  });

  it('joins other destination cleanup after one close rejects', async () => {
    const manager: ReporterManager = new ReporterManager();
    const first: RecordingReporter = new RecordingReporter('first');
    first.throwOnClose = true;
    const second: RecordingReporter = new RecordingReporter('second');
    let releaseClose!: () => void;
    let notifyCloseStarted!: () => void;
    const closeStarted: Promise<void> = new Promise((resolve) => (notifyCloseStarted = resolve));
    const closeFinished: Promise<void> = new Promise((resolve) => (releaseClose = resolve));
    second.closeAsync = async () => {
      notifyCloseStarted();
      await closeFinished;
      second.closeCount++;
    };
    manager.addReporter(first);
    manager.addReporter(second);
    await manager.initializeAsync();

    let settled: boolean = false;
    const disposal: Promise<void> = manager._disposeInitializedReportersAsync();
    const assertion: Promise<void> = expect(disposal).rejects.toThrow('close failed first');
    void disposal.then(
      () => (settled = true),
      () => (settled = true)
    );
    await closeStarted;
    expect(settled).toBe(false);
    releaseClose();
    await assertion;
    expect(second.closeCount).toBe(1);
  });

  it('rejects in-process events before reporters are initialized', () => {
    const manager: ReporterManager = new ReporterManager();
    manager.addReporter(new RecordingReporter('a'));

    expect(() => manager.emit(makeInput('commandStarted'))).toThrow(/must be initialized/);
  });

  it('rejects foreign envelopes before reporters are initialized', () => {
    const manager: ReporterManager = new ReporterManager();
    manager.addReporter(new RecordingReporter('a'));
    const foreign: IReporterEventEnvelope<unknown> = {
      protocolVersion: { major: 1, minor: 0 },
      eventId: 'child_evt',
      sessionId: 'child',
      sequence: 42,
      timestamp: '2026-01-01T00:00:01.000Z',
      source: { packageName: '@rushstack/heft', packageVersion: '1.2.19' },
      privacy: 'public',
      required: false,
      type: 'externalOutput',
      payload: {}
    };

    expect(() => manager.ingestForeignEnvelope(foreign)).toThrow(/must be initialized/);
  });

  it('assigns monotonic sequence, event ids, and timestamps in order', async () => {
    const manager: ReporterManager = new ReporterManager({ now: () => '2026-01-01T00:00:00.000Z' });
    const reporter: RecordingReporter = new RecordingReporter('a');
    manager.addReporter(reporter);
    await manager.initializeAsync();

    const id1: string = manager.emit(makeInput('commandStarted'));
    const id2: string = manager.emit(makeInput('activityChanged'));
    await manager.flushAsync();

    expect([id1, id2]).toEqual(['evt_1', 'evt_2']);
    expect(reporter.reported.map((e: IReporterEventEnvelope<unknown>) => e.sequence)).toEqual([1, 2]);
    expect(reporter.reported[0].eventId).toBe('evt_1');
    expect(reporter.reported[0].timestamp).toBe('2026-01-01T00:00:00.000Z');
  });

  it('delivers protected events synchronously so hard exits cannot strand output', async () => {
    const manager: ReporterManager = new ReporterManager();
    const reporter: RecordingReporter = new RecordingReporter('a');
    manager.addReporter(reporter);
    await manager.initializeAsync();

    manager.emit(makeInput('activityChanged', { text: 'status' }));
    manager.emit(makeInput('externalOutput', { text: 'first' }));
    manager.emit(makeInput('externalOutput', { text: 'second' }));

    expect(reporter.reported.map((event: IReporterEventEnvelope<unknown>) => event.payload)).toEqual([
      { text: 'status' },
      { text: 'first' },
      { text: 'second' }
    ]);
    expect(manager.getPendingEventCount()).toBe(0);
  });

  it('derives the required flag from the event type, ignoring producer input', async () => {
    const manager: ReporterManager = new ReporterManager();
    const reporter: RecordingReporter = new RecordingReporter('a');
    manager.addReporter(reporter);
    await manager.initializeAsync();

    manager.emit(makeInput('activityChanged'));
    manager.emit(makeInput('messageEmitted'));
    manager.emit(makeInput('commandStarted'));
    manager.emit(makeInput('operationStreamClosed'));
    manager.emit(makeInput('operationCompleted'));
    await manager.flushAsync();

    expect(reporter.reported.map((e: IReporterEventEnvelope<unknown>) => e.required)).toEqual([
      false,
      true,
      true,
      false,
      false
    ]);
  });

  it('treats (sessionId, eventId) as event identity, allowing cross-session id reuse', async () => {
    const manager: ReporterManager = new ReporterManager();
    const reporter: RecordingReporter = new RecordingReporter('a');
    manager.addReporter(reporter);
    await manager.initializeAsync();

    // The parent's own first event is evt_1 in session "sess".
    manager.emit(makeInput('commandStarted'));

    // A child session's envelope may reuse the same eventId without collision:
    // the (sessionId, eventId) tuple is the identity.
    const foreign: IReporterEventEnvelope<unknown> = {
      protocolVersion: { major: 1, minor: 0 },
      eventId: 'evt_1',
      sessionId: 'child',
      sequence: 1,
      timestamp: '2026-01-01T00:00:01.000Z',
      source: { packageName: '@rushstack/heft', packageVersion: '1.2.19' },
      privacy: 'public',
      required: true,
      type: 'commandCompleted',
      payload: {}
    };
    manager.ingestForeignEnvelope(foreign);
    await manager.flushAsync();

    const byIdentity: [string, string][] = reporter.reported.map((e: IReporterEventEnvelope<unknown>) => [
      e.sessionId,
      e.eventId
    ]);
    expect(byIdentity).toEqual([
      ['sess', 'evt_1'],
      ['child', 'evt_1']
    ]);
  });

  it('rehomes a foreign envelope with a new sequence and preserved sourceSequence', async () => {
    const manager: ReporterManager = new ReporterManager();
    const reporter: RecordingReporter = new RecordingReporter('a');
    manager.addReporter(reporter);
    await manager.initializeAsync();

    manager.emit(makeInput('commandStarted'));
    const foreign: IReporterEventEnvelope<unknown> = {
      protocolVersion: { major: 1, minor: 0 },
      eventId: 'child_evt',
      sessionId: 'child',
      sequence: 42,
      timestamp: '2026-01-01T00:00:01.000Z',
      source: { packageName: '@rushstack/heft', packageVersion: '1.2.19' },
      privacy: 'public',
      required: false,
      type: 'externalOutput',
      payload: {}
    };
    const id: string = manager.ingestForeignEnvelope(foreign);
    await manager.flushAsync();

    expect(id).toBe('child_evt');
    const ingested: IReporterEventEnvelope<unknown> | undefined = reporter.reported.find(
      (e: IReporterEventEnvelope<unknown>) => e.eventId === 'child_evt'
    );
    expect(ingested?.sequence).toBe(2);
    expect(ingested?.sourceSequence).toBe(42);
    expect(ingested?.required).toBe(true);
  });
});

describe('ReporterManager destinations', () => {
  it('enforces exclusive destination ownership', () => {
    const manager: ReporterManager = new ReporterManager();
    manager.addReporter(new RecordingReporter('a'), { destination: 'stdout' });
    expect(() => manager.addReporter(new RecordingReporter('b'), { destination: 'stdout' })).toThrow(
      /already owned/
    );
  });

  it('allows sharing a destination through a multiplexer', async () => {
    const child1: RecordingReporter = new RecordingReporter('c1');
    const child2: RecordingReporter = new RecordingReporter('c2');
    const manager: ReporterManager = new ReporterManager();
    manager.addReporter(new ReporterMultiplexer('mux', [child1, child2]), { destination: 'stdout' });
    await manager.initializeAsync();

    manager.emit(makeInput('commandStarted'));
    await manager.flushAsync();

    expect(child1.initCount).toBe(1);
    expect(child1.reported).toHaveLength(1);
    expect(child2.reported).toHaveLength(1);
  });

  it('rejects reporters added after initialization', async () => {
    const manager: ReporterManager = new ReporterManager();
    manager.addReporter(new RecordingReporter('a'));
    await manager.initializeAsync();
    expect(() => manager.addReporter(new RecordingReporter('b'))).toThrow(/after the manager/);
  });
});

describe('ReporterManager failure handling', () => {
  it('treats initialization failure as fatal', async () => {
    const reporter: RecordingReporter = new RecordingReporter('a');
    reporter.throwOnInit = true;
    const manager: ReporterManager = new ReporterManager();
    manager.addReporter(reporter);
    await expect(manager.initializeAsync()).rejects.toThrow(/init failed/);
  });

  it('disables an optional reporter on runtime failure and keeps others running', async () => {
    const emergency: string[] = [];
    const manager: ReporterManager = new ReporterManager({
      emergencyDiagnosticWriter: (message: string) => emergency.push(message)
    });
    const bad: RecordingReporter = new RecordingReporter('bad');
    bad.throwOnReportType = 'activityChanged';
    const good: RecordingReporter = new RecordingReporter('good');
    manager.addReporter(bad);
    manager.addReporter(good);
    await manager.initializeAsync();

    manager.emit(makeInput('activityChanged'));
    manager.emit(makeInput('commandCompleted'));
    await manager.closeAsync();

    expect(good.reported).toHaveLength(2);
    expect(bad.reported).toHaveLength(0);
    expect(bad.closeCount).toBe(1);
    expect(emergency.some((m: string) => m.includes('Disabling optional reporter "bad"'))).toBe(true);
  });

  it('surfaces a required reporter failure as a fatal flush error', async () => {
    const manager: ReporterManager = new ReporterManager({ emergencyDiagnosticWriter: () => undefined });
    const bad: RecordingReporter = new RecordingReporter('bad');
    bad.throwOnReportType = 'activityChanged';
    manager.addReporter(bad, { required: true });
    await manager.initializeAsync();

    manager.emit(makeInput('activityChanged'));
    await expect(manager.flushAsync()).rejects.toThrow(/report failed/);
  });

  it('writes the emergency diagnostic only once for a failed required reporter', async () => {
    const emergency: string[] = [];
    const manager: ReporterManager = new ReporterManager({
      emergencyDiagnosticWriter: (message: string) => emergency.push(message)
    });
    const bad: RecordingReporter = new RecordingReporter('bad');
    bad.throwOnReportType = 'activityChanged';
    manager.addReporter(bad, { required: true });
    await manager.initializeAsync();

    manager.emit(makeInput('activityChanged'));
    manager.emit(makeInput('activityChanged'));
    manager.emit(makeInput('activityChanged'));
    await expect(manager.flushAsync()).rejects.toThrow(/report failed/);

    expect(emergency).toHaveLength(1);
    expect(emergency[0]).toContain('Required reporter "bad" failed');
  });
});

describe('ReporterManager coalescing', () => {
  it('coalesces replaceable status events under pressure but never drops protected events', async () => {
    const manager: ReporterManager = new ReporterManager({ coalesceThreshold: 4 });
    const reporter: RecordingReporter = new RecordingReporter('a');
    manager.addReporter(reporter);
    await manager.initializeAsync();

    for (let i: number = 0; i < 20; i++) {
      manager.emit(makeInput('activityChanged', { i }));
    }
    manager.emit(makeInput('commandResult'));
    manager.emit(makeInput('diagnosticEmitted'));
    await manager.flushAsync();

    const activity: IReporterEventEnvelope<unknown>[] = reporter.reported.filter(
      (e: IReporterEventEnvelope<unknown>) => e.type === 'activityChanged'
    );
    const protectedEvents: IReporterEventEnvelope<unknown>[] = reporter.reported.filter(
      (e: IReporterEventEnvelope<unknown>) => e.type === 'commandResult' || e.type === 'diagnosticEmitted'
    );

    expect(protectedEvents).toHaveLength(2);
    expect(activity.length).toBeGreaterThan(0);
    expect(activity.length).toBeLessThan(20);
  });
});

describe('ReporterManager flush and close', () => {
  it('flushes and closes every reporter', async () => {
    const manager: ReporterManager = new ReporterManager();
    const reporter: RecordingReporter = new RecordingReporter('a');
    manager.addReporter(reporter);
    await manager.initializeAsync();

    manager.emit(makeInput('commandStarted'));
    await manager.closeAsync();

    expect(reporter.reported).toHaveLength(1);
    expect(reporter.flushCount).toBeGreaterThanOrEqual(1);
    expect(reporter.closeCount).toBe(1);
  });

  it('surfaces a required reporter close failure', async () => {
    const manager: ReporterManager = new ReporterManager({ emergencyDiagnosticWriter: () => undefined });
    const reporter: RecordingReporter = new RecordingReporter('required');
    reporter.throwOnClose = true;
    manager.addReporter(reporter, { required: true });
    await manager.initializeAsync();

    await expect(manager.closeAsync()).rejects.toThrow(/close failed required/);
    expect(reporter.closeCount).toBe(1);
  });

  it('returns from flush even when a reporter never resolves, using the timeout', async () => {
    const slow: IReporter = {
      name: 'slow',
      async initializeAsync(): Promise<void> {
        /* no-op */
      },
      report(): void {
        /* no-op */
      },
      flushAsync(): Promise<void> {
        return new Promise<void>(() => {
          /* never resolves */
        });
      },
      async closeAsync(): Promise<void> {
        /* no-op */
      }
    };
    const manager: ReporterManager = new ReporterManager();
    manager.addReporter(slow);
    await manager.initializeAsync();

    manager.emit(makeInput('commandStarted'));
    await manager.flushAsync(50);
    expect(true).toBe(true);
  });

  it('reports whether a flush completed before its timeout', async () => {
    let resolveFlush: (() => void) | undefined;
    const reporter: RecordingReporter = new RecordingReporter('confirm');
    reporter.flushAsync = () =>
      new Promise<void>((resolve: () => void) => {
        resolveFlush = resolve;
      });
    const manager: ReporterManager = new ReporterManager();
    manager.addReporter(reporter);
    await manager.initializeAsync();

    await expect(manager._flushAndConfirmAsync(10)).resolves.toBe(false);
    resolveFlush?.();
  });

  it('does not overlap close with a timed-out flush', async () => {
    let resolveFlush: (() => void) | undefined;
    let closeCount: number = 0;
    const slow: IReporter = {
      name: 'slow',
      async initializeAsync(): Promise<void> {
        /* no-op */
      },
      report(): void {
        /* no-op */
      },
      flushAsync(): Promise<void> {
        return new Promise<void>((resolve: () => void) => {
          resolveFlush = resolve;
        });
      },
      async closeAsync(): Promise<void> {
        closeCount++;
      }
    };
    const manager: ReporterManager = new ReporterManager();
    manager.addReporter(slow);
    await manager.initializeAsync();

    await manager.closeAsync(10);
    expect(closeCount).toBe(0);

    resolveFlush!();
    await new Promise<void>((resolve: () => void) => setTimeout(resolve, 0));
    expect(closeCount).toBe(1);
  });
});
