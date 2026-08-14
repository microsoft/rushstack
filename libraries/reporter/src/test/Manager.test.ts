// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  ReporterManager,
  ReporterMultiplexer,
  type IReporter,
  type IReporterEmitEventInput,
  type IReporterEventEnvelope,
  type IReporterEventScope,
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
  public throwOnClose: boolean = false;
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
    if (this.throwOnClose) {
      throw new Error(`close failed ${this.name}`);
    }
  }
}

/**
 * A reporter whose flush stays pending until the test releases it.
 */
class DeferredFlushReporter implements IReporter {
  public readonly name: string;
  public flushCount: number = 0;
  public closeCount: number = 0;
  public closeCalledDuringFlush: boolean = false;
  private _releaseFlush: (() => void) | undefined = undefined;
  private _flushing: boolean = false;

  public constructor(name: string) {
    this.name = name;
  }

  public async initializeAsync(): Promise<void> {
    /* no-op */
  }

  public report(): void {
    /* no-op */
  }

  public flushAsync(): Promise<void> {
    this.flushCount++;
    this._flushing = true;
    return new Promise<void>((resolve: () => void) => {
      this._releaseFlush = resolve;
    });
  }

  public async closeAsync(): Promise<void> {
    this.closeCount++;
    if (this._flushing) {
      this.closeCalledDuringFlush = true;
    }
  }

  public releaseFlush(): void {
    this._flushing = false;
    this._releaseFlush?.();
  }
}

function makeInput(
  type: ReporterEventType,
  payload: ReporterJsonValue = {},
  required: boolean = false,
  scope?: IReporterEventScope
): IReporterEmitEventInput<ReporterJsonValue> {
  return {
    protocolVersion: { major: 1, minor: 0 },
    sessionId: 'sess',
    source: { packageName: '@microsoft/rush-lib', packageVersion: '5.177.2' },
    privacy: 'public',
    required,
    type,
    payload,
    ...(scope ? { scope } : {})
  };
}

function makeForeign(
  overrides: Partial<IReporterEventEnvelope<unknown>> = {}
): IReporterEventEnvelope<unknown> {
  return {
    protocolVersion: { major: 1, minor: 0 },
    eventId: 'child_evt',
    sessionId: 'child',
    sequence: 42,
    timestamp: '2026-01-01T00:00:01.000Z',
    source: { packageName: '@rushstack/heft', packageVersion: '1.2.19' },
    privacy: 'public',
    required: false,
    type: 'externalOutput',
    payload: {},
    ...overrides
  };
}

describe('ReporterManager ordering and assignment', () => {
  it('rejects in-process events before reporters are initialized', () => {
    const manager: ReporterManager = new ReporterManager();
    manager.addReporter(new RecordingReporter('a'));

    expect(() => manager.emit(makeInput('commandStarted'))).toThrow(/must be initialized/);
  });

  it('rejects foreign envelopes before reporters are initialized', () => {
    const manager: ReporterManager = new ReporterManager();
    manager.addReporter(new RecordingReporter('a'));

    expect(() => manager.ingestForeignEnvelope(makeForeign())).toThrow(/must be initialized/);
  });

  it('assigns monotonic sequence, session-qualified event ids, and timestamps in order', async () => {
    const manager: ReporterManager = new ReporterManager({ now: () => '2026-01-01T00:00:00.000Z' });
    const reporter: RecordingReporter = new RecordingReporter('a');
    manager.addReporter(reporter);
    await manager.initializeAsync();

    const id1: string = manager.emit(makeInput('commandStarted'));
    const id2: string = manager.emit(makeInput('activityChanged'));
    await manager.flushAsync();

    expect([id1, id2]).toEqual(['sess:evt_1', 'sess:evt_2']);
    expect(reporter.reported.map((e: IReporterEventEnvelope<unknown>) => e.sequence)).toEqual([1, 2]);
    expect(reporter.reported[0].eventId).toBe('sess:evt_1');
    expect(reporter.reported[0].timestamp).toBe('2026-01-01T00:00:00.000Z');
  });

  it('qualifies event ids with the manager session id when one is configured', async () => {
    const manager: ReporterManager = new ReporterManager({ sessionId: 'sess_root' });
    manager.addReporter(new RecordingReporter('a'));
    await manager.initializeAsync();

    expect(manager.emit(makeInput('commandStarted'))).toBe('sess_root:evt_1');
  });

  it('mints unique event ids for local and re-homed events', async () => {
    const manager: ReporterManager = new ReporterManager();
    const reporter: RecordingReporter = new RecordingReporter('a');
    manager.addReporter(reporter);
    await manager.initializeAsync();

    const ids: string[] = [
      manager.emit(makeInput('commandStarted')),
      // A child that mints ids the same way would otherwise collide with the parent stream.
      manager.ingestForeignEnvelope(makeForeign({ sessionId: 'sess', eventId: 'sess:evt_1' })),
      manager.ingestForeignEnvelope(makeForeign({ sessionId: 'sess', eventId: 'sess:evt_1' })),
      manager.emit(makeInput('activityChanged'))
    ];
    await manager.flushAsync();

    expect(new Set(ids).size).toBe(4);
    const deliveredIds: string[] = reporter.reported.map((e: IReporterEventEnvelope<unknown>) => e.eventId);
    expect(deliveredIds).toEqual(ids);
    expect(new Set(deliveredIds).size).toBe(4);
  });

  it('rehomes a foreign envelope with a new sequence and preserved sourceSequence', async () => {
    const manager: ReporterManager = new ReporterManager();
    const reporter: RecordingReporter = new RecordingReporter('a');
    manager.addReporter(reporter);
    await manager.initializeAsync();

    manager.emit(makeInput('commandStarted'));
    const id: string = manager.ingestForeignEnvelope(makeForeign());
    await manager.flushAsync();

    expect(id).toBe('child:evt_2');
    const ingested: IReporterEventEnvelope<unknown> | undefined = reporter.reported.find(
      (e: IReporterEventEnvelope<unknown>) => e.eventId === id
    );
    expect(ingested?.sequence).toBe(2);
    expect(ingested?.sourceSequence).toBe(42);
    expect(ingested?.sessionId).toBe('child');
  });

  it('preserves the original producer sequence across a second re-homing', async () => {
    const manager: ReporterManager = new ReporterManager();
    const reporter: RecordingReporter = new RecordingReporter('a');
    manager.addReporter(reporter);
    await manager.initializeAsync();

    // A grandchild event that a child session already re-homed: its own local
    // sequence is 3, and the child assigned it sequence 7.
    manager.ingestForeignEnvelope(makeForeign({ sequence: 7, sourceSequence: 3 }));
    await manager.flushAsync();

    expect(reporter.reported[0].sequence).toBe(1);
    expect(reporter.reported[0].sourceSequence).toBe(3);
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

  it('rolls back already-initialized reporters when a later reporter fails to initialize', async () => {
    const good: RecordingReporter = new RecordingReporter('good');
    const bad: RecordingReporter = new RecordingReporter('bad');
    bad.throwOnInit = true;
    const manager: ReporterManager = new ReporterManager();
    manager.addReporter(good);
    manager.addReporter(bad);

    await expect(manager.initializeAsync()).rejects.toThrow(/init failed bad/);

    expect(good.initCount).toBe(1);
    expect(good.closeCount).toBe(1);
    expect(bad.closeCount).toBe(0);
  });

  it('skips flush and close for reporters that never initialized', async () => {
    const good: RecordingReporter = new RecordingReporter('good');
    const bad: RecordingReporter = new RecordingReporter('bad');
    bad.throwOnInit = true;
    const manager: ReporterManager = new ReporterManager();
    manager.addReporter(good);
    manager.addReporter(bad);
    await expect(manager.initializeAsync()).rejects.toThrow(/init failed bad/);

    await manager.closeAsync();

    // The rollback already closed `good`, and `bad` never initialized.
    expect(good.flushCount).toBe(0);
    expect(good.closeCount).toBe(1);
    expect(bad.flushCount).toBe(0);
    expect(bad.closeCount).toBe(0);
  });

  it('rejects a second initialization', async () => {
    const manager: ReporterManager = new ReporterManager();
    const reporter: RecordingReporter = new RecordingReporter('a');
    manager.addReporter(reporter);
    await manager.initializeAsync();

    await expect(manager.initializeAsync()).rejects.toThrow(/already been initialized/);
    expect(reporter.initCount).toBe(1);
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

  it('writes one emergency line for a failing required reporter, stops delivery, and throws once', async () => {
    const emergency: string[] = [];
    const manager: ReporterManager = new ReporterManager({
      emergencyDiagnosticWriter: (message: string) => emergency.push(message)
    });
    const bad: RecordingReporter = new RecordingReporter('bad');
    bad.throwOnReportType = 'activityChanged';
    manager.addReporter(bad, { required: true });
    await manager.initializeAsync();

    for (let i: number = 0; i < 5; i++) {
      manager.emit(makeInput('activityChanged', { i }));
    }
    await expect(manager.flushAsync()).rejects.toThrow(/report failed bad/);

    // Delivery to the failed reporter stops, so later events cannot re-trigger it.
    for (let i: number = 0; i < 5; i++) {
      manager.emit(makeInput('commandCompleted', { i }));
    }
    await expect(manager.flushAsync()).resolves.toBeUndefined();

    expect(emergency).toHaveLength(1);
    expect(emergency[0]).toContain('Required reporter "bad" failed');
    expect(bad.reported).toHaveLength(0);
  });

  it('sanitizes emergency diagnostics to a single line', async () => {
    const emergency: string[] = [];
    const manager: ReporterManager = new ReporterManager({
      emergencyDiagnosticWriter: (message: string) => emergency.push(message)
    });
    const noisy: IReporter = {
      name: 'noisy',
      async initializeAsync(): Promise<void> {
        /* no-op */
      },
      report(): void {
        throw new Error('line one\nline two\r\nline three');
      },
      async flushAsync(): Promise<void> {
        /* no-op */
      },
      async closeAsync(): Promise<void> {
        /* no-op */
      }
    };
    manager.addReporter(noisy);
    await manager.initializeAsync();

    manager.emit(makeInput('commandStarted'));
    await manager.flushAsync();

    expect(emergency).toHaveLength(1);
    expect(emergency[0]).not.toContain('\n');
    expect(emergency[0]).toContain('line one line two line three');
  });

  it('never throws out of signalFlushAsync, even when the emergency writer fails', async () => {
    const manager: ReporterManager = new ReporterManager({
      emergencyDiagnosticWriter: () => {
        throw new Error('EPIPE: broken pipe');
      }
    });
    const failing: IReporter = {
      name: 'failing',
      async initializeAsync(): Promise<void> {
        /* no-op */
      },
      report(): void {
        /* no-op */
      },
      async flushAsync(): Promise<void> {
        throw new Error('flush failed');
      },
      async closeAsync(): Promise<void> {
        /* no-op */
      }
    };
    manager.addReporter(failing, { required: true });
    await manager.initializeAsync();

    manager.emit(makeInput('commandStarted'));
    await expect(manager.signalFlushAsync(50)).resolves.toBeUndefined();
  });
});

describe('ReporterManager event validation', () => {
  it('rejects extension events without a namespaced identifier', async () => {
    const manager: ReporterManager = new ReporterManager();
    manager.addReporter(new RecordingReporter('a'));
    await manager.initializeAsync();

    expect(() => manager.emit(makeInput('extension', { name: 'cacheWarmed' }))).toThrow(
      /namespaced beta identifier/
    );
    expect(() => manager.emit(makeInput('extension', { name: 'Acme.Event' }))).toThrow(
      /namespaced beta identifier/
    );
    expect(() => manager.emit(makeInput('extension', { hits: 3 }))).toThrow(/namespaced beta identifier/);
  });

  it('accepts an extension event with a namespaced identifier', async () => {
    const manager: ReporterManager = new ReporterManager();
    const reporter: RecordingReporter = new RecordingReporter('a');
    manager.addReporter(reporter);
    await manager.initializeAsync();

    manager.emit(makeInput('extension', { name: 'acme.cache-warmed', hits: 3 }));
    await manager.flushAsync();

    expect(reporter.reported).toHaveLength(1);
    expect(reporter.reported[0].type).toBe('extension');
  });

  it('derives the envelope privacy floor from a diagnostic payload', async () => {
    const manager: ReporterManager = new ReporterManager();
    const reporter: RecordingReporter = new RecordingReporter('a');
    manager.addReporter(reporter);
    await manager.initializeAsync();

    const input: IReporterEmitEventInput<ReporterJsonValue> = {
      ...makeInput('diagnosticEmitted', {
        diagnosticId: 'diag_0001',
        code: 'RDC_CONFIG_INVALID_JSON',
        category: 'configuration',
        severity: 'error',
        summaryKey: 'diagnostic.RDC_CONFIG_INVALID_JSON.summary',
        parameters: {
          filePath: { value: '/repo/rush.json', privacy: 'local-sensitive' },
          token: { value: 'abc', privacy: 'secret' }
        }
      }),
      // The producer's claim is not trusted: the floor is computed from the fields.
      privacy: 'secret'
    };
    manager.emit(input);
    manager.emit({ ...makeInput('diagnosticEmitted', { diagnosticId: 'diag_0002' }), privacy: 'secret' });
    await manager.flushAsync();

    expect(reporter.reported[0].privacy).toBe('local-sensitive');
    // Without classified parameters there is nothing to derive, so the producer's value stands.
    expect(reporter.reported[1].privacy).toBe('secret');
  });
});

describe('ReporterManager delivery', () => {
  it('starts draining on a microtask rather than inside emit', async () => {
    const manager: ReporterManager = new ReporterManager();
    const reporter: RecordingReporter = new RecordingReporter('a');
    manager.addReporter(reporter);
    await manager.initializeAsync();

    manager.emit(makeInput('commandStarted'));
    expect(reporter.reported).toHaveLength(0);

    await manager.flushAsync();
    expect(reporter.reported).toHaveLength(1);
  });

  it('delivers an immutable snapshot that post-emit mutation cannot change', async () => {
    const manager: ReporterManager = new ReporterManager();
    const reporter: RecordingReporter = new RecordingReporter('a');
    manager.addReporter(reporter);
    await manager.initializeAsync();

    const payload: { text: string; nested: { count: number } } = { text: 'before', nested: { count: 1 } };
    const scope: IReporterEventScope = { projectName: 'proj-a' };
    manager.emit({ ...makeInput('externalOutput'), payload, scope });

    try {
      payload.text = 'after';
      payload.nested.count = 99;
    } catch {
      // Frozen payloads throw on assignment in strict mode; either way the
      // reporter must observe the original values.
    }
    await manager.flushAsync();

    const delivered: IReporterEventEnvelope<unknown> = reporter.reported[0];
    expect(delivered.payload).toEqual({ text: 'before', nested: { count: 1 } });
    expect(Object.isFrozen(delivered)).toBe(true);
    expect(Object.isFrozen(delivered.payload)).toBe(true);
    expect(Object.isFrozen(delivered.scope)).toBe(true);
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

  it('keeps the latest status of every stream when projects interleave', async () => {
    const manager: ReporterManager = new ReporterManager({ coalesceThreshold: 2 });
    const reporter: RecordingReporter = new RecordingReporter('a');
    manager.addReporter(reporter);
    await manager.initializeAsync();

    for (let i: number = 0; i < 10; i++) {
      const projectName: string = i % 2 === 0 ? 'proj-a' : 'proj-b';
      manager.emit(makeInput('activityChanged', { i }, false, { projectName }));
    }
    await manager.flushAsync();

    const byProject: Map<string, number> = new Map();
    for (const event of reporter.reported) {
      byProject.set(event.scope!.projectName!, (event.payload as { i: number }).i);
    }

    // Each project keeps its own terminal status instead of being overwritten by
    // the other project's chatter.
    expect(byProject.get('proj-a')).toBe(8);
    expect(byProject.get('proj-b')).toBe(9);
  });

  it('bounds a queue at the high-water mark and reports the overflow once', async () => {
    const emergency: string[] = [];
    const manager: ReporterManager = new ReporterManager({
      coalesceThreshold: 1000,
      maxQueuedEventsPerReporter: 8,
      emergencyDiagnosticWriter: (message: string) => emergency.push(message)
    });
    const reporter: RecordingReporter = new RecordingReporter('a');
    manager.addReporter(reporter);
    await manager.initializeAsync();

    for (let i: number = 0; i < 12; i++) {
      manager.emit(makeInput('activityChanged', { i }));
    }
    for (let i: number = 0; i < 4; i++) {
      manager.emit(makeInput('commandResult', { i }, true));
    }
    await manager.flushAsync();

    const activity: IReporterEventEnvelope<unknown>[] = reporter.reported.filter(
      (e: IReporterEventEnvelope<unknown>) => e.type === 'activityChanged'
    );
    const results: IReporterEventEnvelope<unknown>[] = reporter.reported.filter(
      (e: IReporterEventEnvelope<unknown>) => e.type === 'commandResult'
    );

    expect(results).toHaveLength(4);
    expect(activity.length).toBeLessThan(12);
    expect(reporter.reported.length).toBeLessThanOrEqual(8);
    expect(emergency).toHaveLength(1);
    expect(emergency[0]).toContain('exceeded its queue limit of 8 events');
  });

  it('drops the oldest non-required events when nothing replaceable remains', async () => {
    const emergency: string[] = [];
    const manager: ReporterManager = new ReporterManager({
      maxQueuedEventsPerReporter: 4,
      emergencyDiagnosticWriter: (message: string) => emergency.push(message)
    });
    const reporter: RecordingReporter = new RecordingReporter('a');
    manager.addReporter(reporter);
    await manager.initializeAsync();

    for (let i: number = 0; i < 8; i++) {
      manager.emit(makeInput('externalOutput', { i }));
    }
    await manager.flushAsync();

    const delivered: number[] = reporter.reported.map((e: IReporterEventEnvelope<unknown>) => {
      return (e.payload as { i: number }).i;
    });

    expect(delivered).toEqual([4, 5, 6, 7]);
    expect(emergency).toHaveLength(1);
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

  it('rejects events published after close', async () => {
    const manager: ReporterManager = new ReporterManager();
    const reporter: RecordingReporter = new RecordingReporter('a');
    manager.addReporter(reporter);
    await manager.initializeAsync();
    await manager.closeAsync();

    expect(() => manager.emit(makeInput('commandStarted'))).toThrow(/closed/);
    expect(() => manager.ingestForeignEnvelope(makeForeign())).toThrow(/closed/);
    expect(reporter.reported).toHaveLength(0);
  });

  it('is idempotent, so a repeated close never closes a reporter twice', async () => {
    const manager: ReporterManager = new ReporterManager();
    const reporter: RecordingReporter = new RecordingReporter('a');
    manager.addReporter(reporter);
    await manager.initializeAsync();

    manager.emit(makeInput('commandStarted'));
    await Promise.all([manager.closeAsync(), manager.closeAsync()]);
    await manager.closeAsync();

    expect(reporter.closeCount).toBe(1);
    expect(reporter.flushCount).toBe(1);
  });

  it('reports a flush timeout through one emergency diagnostic', async () => {
    const emergency: string[] = [];
    const manager: ReporterManager = new ReporterManager({
      emergencyDiagnosticWriter: (message: string) => emergency.push(message)
    });
    const slow: DeferredFlushReporter = new DeferredFlushReporter('slow');
    manager.addReporter(slow);
    await manager.initializeAsync();

    manager.emit(makeInput('commandStarted'));
    await manager.flushAsync(50);

    expect(emergency).toHaveLength(1);
    expect(emergency[0]).toContain('Reporter "slow" did not finish flushing within 50ms');
    slow.releaseFlush();
  });

  it('never closes a reporter whose flush is still in flight, and keeps one timeout budget', async () => {
    const emergency: string[] = [];
    const manager: ReporterManager = new ReporterManager({
      emergencyDiagnosticWriter: (message: string) => emergency.push(message)
    });
    const slow: DeferredFlushReporter = new DeferredFlushReporter('slow');
    const fast: RecordingReporter = new RecordingReporter('fast');
    manager.addReporter(slow);
    manager.addReporter(fast);
    await manager.initializeAsync();

    manager.emit(makeInput('commandStarted'));
    const startedAt: number = Date.now();
    await manager.closeAsync(100);
    const elapsed: number = Date.now() - startedAt;

    expect(slow.flushCount).toBe(1);
    expect(slow.closeCount).toBe(0);
    expect(slow.closeCalledDuringFlush).toBe(false);
    // The healthy reporter still flushes and closes.
    expect(fast.flushCount).toBe(1);
    expect(fast.closeCount).toBe(1);
    // Flush and close share one budget rather than one budget each.
    expect(elapsed).toBeLessThan(200);
    expect(emergency).toHaveLength(1);
    slow.releaseFlush();
  });

  it('rethrows when a required reporter fails to close', async () => {
    const emergency: string[] = [];
    const manager: ReporterManager = new ReporterManager({
      emergencyDiagnosticWriter: (message: string) => emergency.push(message)
    });
    const bad: RecordingReporter = new RecordingReporter('bad');
    bad.throwOnClose = true;
    manager.addReporter(bad, { required: true });
    await manager.initializeAsync();

    manager.emit(makeInput('commandStarted'));
    await expect(manager.closeAsync()).rejects.toThrow(/close failed bad/);
    expect(emergency).toHaveLength(1);
  });

  it('returns from flush even when a reporter never resolves, using the timeout', async () => {
    const emergency: string[] = [];
    const manager: ReporterManager = new ReporterManager({
      emergencyDiagnosticWriter: (message: string) => emergency.push(message)
    });
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
    manager.addReporter(slow);
    await manager.initializeAsync();

    manager.emit(makeInput('commandStarted'));
    await manager.flushAsync(50);
    expect(emergency).toHaveLength(1);
  });
});
