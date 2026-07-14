// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  ReporterManager,
  ReporterMultiplexer,
  type IReporter,
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

describe('ReporterManager ordering and assignment', () => {
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
    await manager.flushAsync();

    expect(good.reported).toHaveLength(2);
    expect(bad.reported).toHaveLength(0);
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
});
