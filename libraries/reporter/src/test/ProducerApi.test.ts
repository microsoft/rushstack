// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  isReporterExtensionEventName,
  type IReporterEmitEventInput,
  type IReporterEventEnvelope,
  type IReporterEventSink,
  type IRushDiagnostic,
  type IScopedReporter,
  type ReporterEventType,
  type ReporterExtensionEventName,
  type ReporterJsonValue
} from '../index';
import type {
  ICommandStartedPayload,
  IReporterEventEnvelopeFor,
  IReporterEventPayloadMap
} from '../events/ReporterEventPayloads';

describe('IReporterEventSink', () => {
  it('accepts an input that omits the sink-assigned fields and returns an event id', () => {
    const published: IReporterEventEnvelope<unknown>[] = [];
    let nextSequence: number = 1;

    const sink: IReporterEventSink = {
      emit<TPayload extends ReporterJsonValue>(event: IReporterEmitEventInput<TPayload>): string {
        const sequence: number = nextSequence++;
        const eventId: string = `evt_${sequence}`;
        published.push({
          ...event,
          eventId,
          sequence,
          timestamp: '2026-07-12T00:00:00.000Z'
        });
        return eventId;
      }
    };

    // The producer never supplies eventId, sequence, or timestamp.
    const input: IReporterEmitEventInput<{ commandName: string }> = {
      protocolVersion: { major: 1, minor: 0 },
      sessionId: 'sess_root',
      source: { packageName: '@microsoft/rush-lib', packageVersion: '5.177.2' },
      privacy: 'public',
      required: true,
      type: 'commandStarted',
      payload: { commandName: 'build' }
    };

    const eventId: string = sink.emit(input);

    expect(eventId).toBe('evt_1');
    expect(published).toHaveLength(1);
    expect(published[0].sequence).toBe(1);
    expect(published[0].eventId).toBe('evt_1');
    expect(published[0].timestamp).toBe('2026-07-12T00:00:00.000Z');
    expect(published[0].payload).toEqual({ commandName: 'build' });
  });
});

describe('IScopedReporter', () => {
  function createScopedReporter(sink: string[]): IScopedReporter {
    let nextId: number = 1;
    const assign = (): string => `evt_${nextId++}`;
    return {
      emitMessage(): string {
        const id: string = assign();
        sink.push(id);
        return id;
      },
      emitDiagnostic(): string {
        const id: string = assign();
        sink.push(id);
        return id;
      },
      emitOperationStatus(): string {
        const id: string = assign();
        sink.push(id);
        return id;
      },
      emitActivity(): string {
        const id: string = assign();
        sink.push(id);
        return id;
      },
      emitArtifact(): string {
        const id: string = assign();
        sink.push(id);
        return id;
      },
      emitExtension(): string {
        const id: string = assign();
        sink.push(id);
        return id;
      }
    };
  }

  it('returns an event id from every emit method', () => {
    const ids: string[] = [];
    const reporter: IScopedReporter = createScopedReporter(ids);

    const diagnostic: IRushDiagnostic = {
      diagnosticId: 'diag_0001',
      code: 'RDC_CONFIG_INVALID_JSON',
      category: 'configuration',
      severity: 'error',
      summaryKey: 'diagnostic.RDC_CONFIG_INVALID_JSON.summary'
    };

    expect(reporter.emitMessage({ severity: 'info', text: 'Building...' })).toBe('evt_1');
    expect(reporter.emitDiagnostic(diagnostic)).toBe('evt_2');
    expect(reporter.emitOperationStatus({ status: 'success', durationMs: 1234 })).toBe('evt_3');
    expect(reporter.emitActivity({ completedOperationCount: 1, totalOperationCount: 2 })).toBe('evt_4');
    expect(reporter.emitArtifact({ artifactId: 'artifact_log', kind: 'log', available: true })).toBe('evt_5');
    expect(reporter.emitExtension('acme.cache-warmed', { hits: 3 })).toBe('evt_6');
    expect(ids).toEqual(['evt_1', 'evt_2', 'evt_3', 'evt_4', 'evt_5', 'evt_6']);
  });

  it('exposes only emit methods, not reporter instances, destinations, or thresholds', () => {
    const reporter: IScopedReporter = createScopedReporter([]);
    expect(Object.keys(reporter).sort()).toEqual([
      'emitActivity',
      'emitArtifact',
      'emitDiagnostic',
      'emitExtension',
      'emitMessage',
      'emitOperationStatus'
    ]);
  });
});

describe('isReporterExtensionEventName', () => {
  it('accepts namespaced beta identifiers', () => {
    expect(isReporterExtensionEventName('acme.cache-warmed')).toBe(true);
    expect(isReporterExtensionEventName('acme.build.step2')).toBe(true);
    expect(isReporterExtensionEventName('vendor1.a1-b2')).toBe(true);
  });

  it('rejects non-namespaced or malformed identifiers', () => {
    expect(isReporterExtensionEventName('cacheWarmed')).toBe(false); // no namespace
    expect(isReporterExtensionEventName('Acme.Event')).toBe(false); // uppercase
    expect(isReporterExtensionEventName('1acme.event')).toBe(false); // leading digit
    expect(isReporterExtensionEventName('acme.')).toBe(false); // trailing dot
    expect(isReporterExtensionEventName('acme..event')).toBe(false); // empty segment
    expect(isReporterExtensionEventName('acme.event-')).toBe(false); // trailing hyphen
  });
});

describe('IReporterEventSink JSON payload constraint', () => {
  const baseInput: Omit<IReporterEmitEventInput<ReporterJsonValue>, 'type' | 'payload'> = {
    protocolVersion: { major: 1, minor: 0 },
    sessionId: 'sess_root',
    source: { packageName: '@microsoft/rush-lib', packageVersion: '5.177.2' },
    privacy: 'public',
    required: false
  };

  it('accepts a JSON payload but rejects a non-JSON payload at compile time', () => {
    const sink: IReporterEventSink = {
      emit<TPayload extends ReporterJsonValue>(event: IReporterEmitEventInput<TPayload>): string {
        void event;
        return 'evt_1';
      }
    };

    const okId: string = sink.emit({ ...baseInput, type: 'extension', payload: { hits: 3 } });
    expect(okId).toBe('evt_1');

    // A Map cannot round-trip through NDJSON, so the sink must reject it.
    // @ts-expect-error - Map is not assignable to ReporterJsonValue
    sink.emit<Map<string, number>>({ ...baseInput, type: 'extension', payload: new Map<string, number>() });
  });
});

describe('IReporterEventEnvelopeFor', () => {
  const envelopeBase: Omit<IReporterEventEnvelope<unknown>, 'type' | 'payload'> = {
    protocolVersion: { major: 1, minor: 0 },
    eventId: 'evt_0001',
    sessionId: 'sess_root',
    sequence: 1,
    timestamp: '2026-07-12T00:00:00.000Z',
    source: { packageName: '@microsoft/rush-lib', packageVersion: '5.177.2' },
    privacy: 'public',
    required: true
  };

  it('correlates the payload type with the event type', () => {
    const started: IReporterEventEnvelopeFor<'commandStarted'> = {
      ...envelopeBase,
      type: 'commandStarted',
      payload: { commandName: 'build', argv: ['--to', '@rushstack/reporter'] }
    };

    // `payload` is strongly typed as ICommandStartedPayload, so no cast is needed.
    const payload: ICommandStartedPayload = started.payload;
    expect(payload.commandName).toBe('build');
    expect(payload.argv).toEqual(['--to', '@rushstack/reporter']);
  });

  it('rejects a payload that does not match the event type at compile time', () => {
    const wrong: IReporterEventEnvelopeFor<'commandStarted'> = {
      ...envelopeBase,
      type: 'commandStarted',
      // @ts-expect-error - payload must be ICommandStartedPayload, not a string
      payload: 'not-a-command-started-payload'
    };
    void wrong;
    expect(true).toBe(true);
  });
});

describe('IReporterEventPayloadMap', () => {
  it('maps every core event type to a JSON-serializable payload', () => {
    type CoversAllTypes = ReporterEventType extends keyof IReporterEventPayloadMap ? true : never;
    type NoExtraKeys = keyof IReporterEventPayloadMap extends ReporterEventType ? true : never;
    type PayloadsAreJson = {
      [TType in keyof IReporterEventPayloadMap]: IReporterEventPayloadMap[TType] extends ReporterJsonValue
        ? true
        : false;
    };
    type AllPayloadsAreJson = PayloadsAreJson[keyof PayloadsAreJson] extends true ? true : never;

    const coversAllTypes: CoversAllTypes = true;
    const noExtraKeys: NoExtraKeys = true;
    const allPayloadsAreJson: AllPayloadsAreJson = true;

    expect(coversAllTypes && noExtraKeys && allPayloadsAreJson).toBe(true);
  });
});

describe('ReporterExtensionEventName type', () => {
  it('accepts a namespaced identifier and rejects a malformed one at compile time', () => {
    const good: ReporterExtensionEventName = 'acme.cache-warmed';
    expect(isReporterExtensionEventName(good)).toBe(true);

    // @ts-expect-error - 'Not A Name' is not a namespaced lowercase identifier
    const bad: ReporterExtensionEventName = 'Not A Name';
    void bad;
  });
});
