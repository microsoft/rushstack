// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  ReporterManager,
  REPORTER_PERFORMANCE_BUDGETS,
  computeWallTimeRegressionPercent,
  isWithinWallTimeBudget,
  isWithinMemoryBudget,
  type IReporter,
  type IReporterEmitEventInput,
  type IReporterEventEnvelope,
  type ReporterEventType,
  type ReporterJsonValue
} from '../index';

class CountingReporter implements IReporter {
  public readonly name: string;
  public readonly counts: Map<ReporterEventType, number> = new Map();
  public total: number = 0;

  public constructor(name: string) {
    this.name = name;
  }

  public async initializeAsync(): Promise<void> {
    /* no-op */
  }

  public report(event: IReporterEventEnvelope<unknown>): void {
    this.counts.set(event.type, (this.counts.get(event.type) ?? 0) + 1);
    this.total++;
  }

  public async flushAsync(): Promise<void> {
    /* no-op */
  }

  public async closeAsync(): Promise<void> {
    /* no-op */
  }
}

function makeInput(
  type: ReporterEventType,
  payload: ReporterJsonValue = {},
  required: boolean = false
): IReporterEmitEventInput<ReporterJsonValue> {
  return {
    protocolVersion: { major: 1, minor: 0 },
    sessionId: 'sess',
    source: { packageName: '@microsoft/rush-lib', packageVersion: '5.177.2' },
    privacy: 'public',
    required,
    type,
    payload
  };
}

// Representatives of every protected outcome category from specification §7.3:
// lifecycle, diagnostics, results, artifacts, and external output.
const PROTECTED_TYPES: readonly ReporterEventType[] = [
  'sessionCompleted',
  'operationStatusChanged',
  'watchCycleCompleted',
  'diagnosticEmitted',
  'commandResult',
  'artifactAvailable',
  'externalProcessStarted',
  'externalOutput',
  'externalProcessCompleted'
];

describe('reporter performance budgets', () => {
  it('exposes the specification §7.3 blocking budgets', () => {
    expect(REPORTER_PERFORMANCE_BUDGETS.maxWallTimeRegressionPercent).toBe(3);
    expect(REPORTER_PERFORMANCE_BUDGETS.maxAdditionalPeakMemoryBytes).toBe(32 * 1024 * 1024);
    expect(REPORTER_PERFORMANCE_BUDGETS.maxInteractiveRefreshHz).toBe(10);
    expect(REPORTER_PERFORMANCE_BUDGETS.maxAiOutputBytes).toBe(64 * 1024);
    expect(REPORTER_PERFORMANCE_BUDGETS.maxAiDetailedDiagnostics).toBe(20);
  });

  it('evaluates wall-time regression against the 3 percent budget', () => {
    expect(computeWallTimeRegressionPercent(1000, 1020)).toBeCloseTo(2, 5);
    expect(computeWallTimeRegressionPercent(1000, 980)).toBeCloseTo(-2, 5);
    expect(isWithinWallTimeBudget(1000, 1030)).toBe(true);
    expect(isWithinWallTimeBudget(1000, 1031)).toBe(false);
    expect(() => computeWallTimeRegressionPercent(0, 10)).toThrow();
  });

  it('evaluates additional peak memory against the 32 MiB budget', () => {
    expect(isWithinMemoryBudget(31 * 1024 * 1024)).toBe(true);
    expect(isWithinMemoryBudget(32 * 1024 * 1024)).toBe(true);
    expect(isWithinMemoryBudget(33 * 1024 * 1024)).toBe(false);
  });
});

describe('reporter bounded streaming', () => {
  it('keeps the pending queue bounded during a large synchronous burst', async () => {
    const manager: ReporterManager = new ReporterManager({ coalesceThreshold: 64 });
    const reporter: CountingReporter = new CountingReporter('a');
    manager.addReporter(reporter);
    await manager.initializeAsync();

    const burst: number = 5000;
    for (let i: number = 0; i < burst; i++) {
      manager.emit(makeInput('activityChanged', { i }));
    }

    // No microtask has run yet, so the queue holds every un-drained event. If the
    // manager buffered the whole build it would hold ~5000; coalescing keeps it
    // near the threshold instead, proving bounded rather than whole-build memory.
    const pendingDuringBurst: number = manager.getPendingEventCount();
    expect(pendingDuringBurst).toBeLessThan(200);

    await manager.flushAsync();
    expect(manager.getPendingEventCount()).toBe(0);
  });

  it('completes a high-volume benchmark within the wall-time smoke ceiling', async () => {
    const manager: ReporterManager = new ReporterManager();
    const reporter: CountingReporter = new CountingReporter('a');
    manager.addReporter(reporter);
    await manager.initializeAsync();

    const volume: number = 50000;
    const startMs: number = Date.now();
    for (let i: number = 0; i < volume; i++) {
      manager.emit(makeInput('activityChanged', { i }));
    }
    await manager.flushAsync();
    const elapsedMs: number = Date.now() - startMs;

    // Generous smoke ceiling: the harness must sustain many thousands of events
    // per second so a real build's per-event overhead stays negligible.
    expect(elapsedMs).toBeLessThan(10000);
    expect(reporter.total).toBeGreaterThan(0);
    expect(manager.getPendingEventCount()).toBe(0);
  });
});

describe('reporter queue pressure', () => {
  it('preserves every protected outcome category while coalescing status noise', async () => {
    const manager: ReporterManager = new ReporterManager({ coalesceThreshold: 8 });
    const reporter: CountingReporter = new CountingReporter('a');
    manager.addReporter(reporter);
    await manager.initializeAsync();

    const activityCount: number = 3000;
    let protectedBatches: number = 0;
    for (let i: number = 0; i < activityCount; i++) {
      manager.emit(makeInput('activityChanged', { i }));
      if (i % 300 === 0) {
        for (const type of PROTECTED_TYPES) {
          manager.emit(makeInput(type, { i }));
        }
        protectedBatches++;
      }
    }
    await manager.flushAsync();

    // Every protected event of every category is delivered exactly once per batch.
    for (const type of PROTECTED_TYPES) {
      expect(reporter.counts.get(type) ?? 0).toBe(protectedBatches);
    }

    // Replaceable status noise is coalesced under pressure: fewer than emitted,
    // but never fully suppressed.
    const deliveredActivity: number = reporter.counts.get('activityChanged') ?? 0;
    expect(deliveredActivity).toBeGreaterThan(0);
    expect(deliveredActivity).toBeLessThan(activityCount);
    expect(manager.getPendingEventCount()).toBe(0);
  });

  it('never coalesces required status events', async () => {
    const manager: ReporterManager = new ReporterManager({ coalesceThreshold: 8 });
    const reporter: CountingReporter = new CountingReporter('a');
    manager.addReporter(reporter);
    await manager.initializeAsync();

    const requiredCount: number = 250;
    for (let i: number = 0; i < requiredCount; i++) {
      manager.emit(makeInput('activityChanged', { i }, /* required */ true));
    }
    for (let i: number = 0; i < 2000; i++) {
      manager.emit(makeInput('activityChanged', { i }, /* required */ false));
    }
    await manager.flushAsync();

    // Required events are protected, so all of them survive even under pressure,
    // while the optional ones are coalesced.
    expect(reporter.counts.get('activityChanged') ?? 0).toBeGreaterThanOrEqual(requiredCount);
    expect(reporter.counts.get('activityChanged') ?? 0).toBeLessThan(requiredCount + 2000);
  });
});
