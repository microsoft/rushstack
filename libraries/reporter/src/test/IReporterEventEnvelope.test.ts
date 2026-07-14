// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  REPORTER_EVENT_TYPES,
  type IReporterEventEnvelope,
  type ReporterEventType,
  type ReporterJsonValue
} from '../index';

describe('ReporterEventType', () => {
  it('exposes the closed core union as an ordered runtime list', () => {
    // Golden: the closed core union. Changing this set is a protocol change.
    expect(REPORTER_EVENT_TYPES).toEqual([
      'sessionStarted',
      'sessionCompleted',
      'commandStarted',
      'commandCompleted',
      'operationRegistered',
      'operationStatusChanged',
      'activityChanged',
      'watchCycleCompleted',
      'diagnosticEmitted',
      'externalProcessStarted',
      'externalOutput',
      'externalProcessCompleted',
      'artifactAvailable',
      'commandResult',
      'extension'
    ]);
  });

  it('contains no duplicate identifiers', () => {
    expect(new Set(REPORTER_EVENT_TYPES).size).toBe(REPORTER_EVENT_TYPES.length);
  });
});

describe('IReporterEventEnvelope', () => {
  interface ICommandStartedPayload {
    readonly commandName: string;
    readonly argv: readonly string[];
  }

  function createEnvelope(): IReporterEventEnvelope<ICommandStartedPayload> {
    const type: ReporterEventType = 'commandStarted';
    return {
      protocolVersion: { major: 1, minor: 0 },
      eventId: 'evt_0001',
      sessionId: 'sess_root',
      sequence: 1,
      timestamp: '2026-07-12T00:00:00.000Z',
      source: {
        packageName: '@microsoft/rush-lib',
        packageVersion: '5.177.2'
      },
      scope: {
        commandName: 'build'
      },
      privacy: 'public',
      required: true,
      type,
      payload: {
        commandName: 'build',
        argv: ['--to', '@rushstack/reporter']
      }
    };
  }

  it('matches the golden envelope shape', () => {
    expect(createEnvelope()).toMatchSnapshot();
  });

  it('round-trips through JSON without data loss', () => {
    const envelope: IReporterEventEnvelope<ICommandStartedPayload> = createEnvelope();
    const roundTripped: IReporterEventEnvelope<ICommandStartedPayload> = JSON.parse(JSON.stringify(envelope));
    expect(roundTripped).toEqual(envelope);
  });

  it('preserves the producer local sequence as sourceSequence for child sessions', () => {
    const childEnvelope: IReporterEventEnvelope<ReporterJsonValue> = {
      protocolVersion: { major: 1, minor: 0 },
      eventId: 'evt_0002',
      sessionId: 'sess_child',
      parentSessionId: 'sess_root',
      parentOperationId: 'op_42',
      sequence: 7,
      sourceSequence: 2,
      timestamp: '2026-07-12T00:00:01.000Z',
      source: {
        packageName: '@rushstack/heft',
        packageVersion: '1.2.19'
      },
      privacy: 'public',
      required: false,
      type: 'externalOutput',
      payload: { stream: 'stdout', text: 'Building...' }
    };

    // The manager assigns the global `sequence` while the producer's own order is retained.
    expect(childEnvelope.sequence).toBe(7);
    expect(childEnvelope.sourceSequence).toBe(2);
    expect(JSON.parse(JSON.stringify(childEnvelope))).toEqual(childEnvelope);
  });

  it('carries Error information as a JSON-serializable payload rather than an Error instance', () => {
    const error: Error = new Error('something failed');

    // A raw Error does not survive JSON serialization: its `message` is dropped.
    expect(JSON.stringify(error)).toBe('{}');

    // Producers convert the Error into plain fields before emitting.
    const envelope: IReporterEventEnvelope<ReporterJsonValue> = {
      protocolVersion: { major: 1, minor: 0 },
      eventId: 'evt_0003',
      sessionId: 'sess_root',
      sequence: 9,
      timestamp: '2026-07-12T00:00:02.000Z',
      source: { packageName: '@microsoft/rush-lib', packageVersion: '5.177.2' },
      privacy: 'public',
      required: true,
      type: 'diagnosticEmitted',
      payload: { name: error.name, message: error.message }
    };

    const roundTripped: IReporterEventEnvelope<ReporterJsonValue> = JSON.parse(JSON.stringify(envelope));
    expect(roundTripped.payload).toEqual({ name: 'Error', message: 'something failed' });
  });
});
