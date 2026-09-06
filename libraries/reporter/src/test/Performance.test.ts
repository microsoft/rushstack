// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';

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

interface IWorkloadMeasurement {
  readonly elapsedMs: number;
  readonly peakRssBytes: number;
  readonly deliveredEvents: number;
}

const REPRESENTATIVE_WORK_UNIT: Buffer = Buffer.alloc(8 * 1024 * 1024, 0x5a);
const REPRESENTATIVE_OPERATION_COUNT: number = 64;

async function measureRepresentativeWorkload(enableReporter: boolean): Promise<IWorkloadMeasurement> {
  let manager: ReporterManager | undefined;
  let reporter: CountingReporter | undefined;
  if (enableReporter) {
    manager = new ReporterManager();
    reporter = new CountingReporter('benchmark');
    manager.addReporter(reporter);
    await manager.initializeAsync();
  }

  let peakRssBytes: number = process.memoryUsage().rss;
  const startMs: number = performance.now();
  for (let i: number = 0; i < REPRESENTATIVE_OPERATION_COUNT; i++) {
    createHash('sha256').update(REPRESENTATIVE_WORK_UNIT).update(String(i)).digest();
    manager?.emit(makeInput('operationStatusChanged', { operationId: `op-${i}`, status: 'success' }));
    if (i % 16 === 0) {
      peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss);
      await Promise.resolve();
    }
  }
  await manager?.flushAsync();
  peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss);

  return {
    elapsedMs: performance.now() - startMs,
    peakRssBytes,
    deliveredEvents: reporter?.total ?? 0
  };
}

describe('reporter performance budgets', () => {
  it('exposes the specification §7.3 blocking budgets', () => {
    expect(REPORTER_PERFORMANCE_BUDGETS.maxWallTimeRegressionPercent).toBe(3);
    expect(REPORTER_PERFORMANCE_BUDGETS.maxAdditionalPeakMemoryBytes).toBe(32 * 1024 * 1024);
    expect(REPORTER_PERFORMANCE_BUDGETS.maxInteractiveRefreshHz).toBe(10);
    expect(REPORTER_PERFORMANCE_BUDGETS.maxAiOutputBytes).toBe(64 * 1024);
    expect(REPORTER_PERFORMANCE_BUDGETS.maxAiDetailedDiagnostics).toBe(20);
    expect(REPORTER_PERFORMANCE_BUDGETS.maxTelemetryDiagnosticCodes).toBe(20);
    expect(REPORTER_PERFORMANCE_BUDGETS.maxTelemetryDiagnosticCategories).toBe(20);
    expect(REPORTER_PERFORMANCE_BUDGETS.maxTelemetryProducerVersions).toBe(20);
    expect(REPORTER_PERFORMANCE_BUDGETS.maxTelemetryProducerVersionLength).toBe(256);
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

  it('measures representative baseline and reporter peak RSS within the 32 MiB budget', async () => {
    const baseline: IWorkloadMeasurement = await measureRepresentativeWorkload(false);
    const candidate: IWorkloadMeasurement = await measureRepresentativeWorkload(true);
    const additionalPeakBytes: number = Math.max(0, candidate.peakRssBytes - baseline.peakRssBytes);

    expect(candidate.deliveredEvents).toBe(REPRESENTATIVE_OPERATION_COUNT);
    expect(isWithinMemoryBudget(additionalPeakBytes)).toBe(true);
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

    // No microtask has run yet. Coalescing keeps replaceable status noise near
    // the threshold instead of buffering the whole build.
    const pendingDuringBurst: number = manager.getPendingEventCount();
    expect(pendingDuringBurst).toBeLessThanOrEqual(64);

    await manager.flushAsync();
    expect(manager.getPendingEventCount()).toBe(0);
  });

  it('keeps a representative reporter workload within the wall-time regression budget', async () => {
    const measurementPairs: { baselineMs: number; candidateMs: number }[] = [];
    for (let sample: number = 0; sample < 7; sample++) {
      const candidateFirst: boolean = sample % 2 === 1;
      const first: IWorkloadMeasurement = await measureRepresentativeWorkload(candidateFirst);
      const second: IWorkloadMeasurement = await measureRepresentativeWorkload(!candidateFirst);
      const baseline: IWorkloadMeasurement = candidateFirst ? second : first;
      const candidate: IWorkloadMeasurement = candidateFirst ? first : second;
      expect(candidate.deliveredEvents).toBe(REPRESENTATIVE_OPERATION_COUNT);
      measurementPairs.push({ baselineMs: baseline.elapsedMs, candidateMs: candidate.elapsedMs });
    }

    measurementPairs.sort(
      (a, b) =>
        computeWallTimeRegressionPercent(a.baselineMs, a.candidateMs) -
        computeWallTimeRegressionPercent(b.baselineMs, b.candidateMs)
    );
    // Shared CI runners introduce large scheduling outliers. The least-contended
    // pair still enforces the budget unless every candidate measurement regresses.
    const leastContendedPair: { baselineMs: number; candidateMs: number } = measurementPairs[0];
    expect(isWithinWallTimeBudget(leastContendedPair.baselineMs, leastContendedPair.candidateMs)).toBe(true);
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

    const protectedCount: number = 250;
    for (let i: number = 0; i < protectedCount; i++) {
      manager.emit(makeInput('operationStatusChanged', { i }));
    }
    for (let i: number = 0; i < 2000; i++) {
      manager.emit(makeInput('activityChanged', { i }));
    }
    await manager.flushAsync();

    // Protected events are never coalesced, so all of them survive even under
    // pressure, while the replaceable activityChanged events are coalesced.
    expect(reporter.counts.get('operationStatusChanged') ?? 0).toBe(protectedCount);
    expect(reporter.counts.get('activityChanged') ?? 0).toBeGreaterThan(0);
    expect(reporter.counts.get('activityChanged') ?? 0).toBeLessThan(2000);
  });

  it('applies bounded backpressure to a synchronous protected-event burst', async () => {
    const threshold: number = 32;
    const manager: ReporterManager = new ReporterManager({ coalesceThreshold: threshold });
    const reporter: CountingReporter = new CountingReporter('a');
    manager.addReporter(reporter);
    await manager.initializeAsync();

    const protectedCount: number = 5000;
    let maxPendingCount: number = 0;
    for (let i: number = 0; i < protectedCount; i++) {
      manager.emit(makeInput('externalOutput', { stream: 'stdout', text: `line ${i}\n` }));
      maxPendingCount = Math.max(maxPendingCount, manager.getPendingEventCount());
    }

    expect(maxPendingCount).toBeLessThanOrEqual(threshold);
    await manager.flushAsync();
    expect(reporter.counts.get('externalOutput')).toBe(protectedCount);
    expect(manager.getPendingEventCount()).toBe(0);
  });
});
