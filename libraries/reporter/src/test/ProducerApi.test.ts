// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  isReporterExtensionEventName,
  type IReporterEmitEventInput,
  type IReporterEventEnvelope,
  type IReporterEventSink,
  type IRushDiagnostic,
  type IScopedReporter
} from '../index';

describe('IReporterEventSink', () => {
  it('accepts an input that omits the sink-assigned fields and returns an event id', () => {
    const published: IReporterEventEnvelope<unknown>[] = [];
    let nextSequence: number = 1;

    const sink: IReporterEventSink = {
      emit<TPayload>(event: IReporterEmitEventInput<TPayload>): string {
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
      code: 'RUSH_CONFIG_INVALID',
      severity: 'error',
      summaryKey: 'config.invalid.summary'
    };

    expect(reporter.emitMessage({ severity: 'info', text: 'Building...' })).toBe('evt_1');
    expect(reporter.emitDiagnostic(diagnostic)).toBe('evt_2');
    expect(reporter.emitExtension('acme.cache-warmed', { hits: 3 })).toBe('evt_3');
    expect(ids).toEqual(['evt_1', 'evt_2', 'evt_3']);
  });

  it('exposes only emit methods, not reporter instances, destinations, or thresholds', () => {
    const reporter: IScopedReporter = createScopedReporter([]);
    expect(Object.keys(reporter).sort()).toEqual(['emitDiagnostic', 'emitExtension', 'emitMessage']);
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
