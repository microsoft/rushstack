// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { DaemonVerbosity, IDaemonEventEnvelope } from '@rushstack/rush-daemon-protocol';
import {
  RUSHD_OPERATION_HEADER,
  RUSHD_OPERATION_STREAM_CLOSED
} from '@rushstack/rush-daemon-protocol';

import { DaemonRendererHost } from '../DaemonRendererHost';

import { TestTerminal } from './TestTerminal';

const OPERATION_ID: string = 'op-a';
const PROTOCOL_MAJOR: number = 0;
const PROTOCOL_MINOR: number = 1;
const EVENT_SEQUENCE: number = 1;
const VERBOSITIES: ReadonlyArray<DaemonVerbosity> = ['quiet', 'normal', 'verbose', 'debug'];

const BASE_ENVELOPE = {
  eventId: 'event',
  privacy: 'public',
  protocolVersion: { major: PROTOCOL_MAJOR, minor: PROTOCOL_MINOR },
  required: false,
  sequence: EVENT_SEQUENCE,
  sessionId: 'session',
  source: { packageName: 'test', packageVersion: '0' },
  timestamp: '2026-08-25T00:00:00.000Z'
} as const;

function extension(name: string, data: unknown): IDaemonEventEnvelope {
  return {
    ...BASE_ENVELOPE,
    payload: { data, name },
    required: true,
    type: 'extension'
  };
}

it('uses authoritative partial-warm header counters at every verbosity', async () => {
  for (const verbosity of VERBOSITIES) {
    const terminal: TestTerminal = new TestTerminal();
    const host: DaemonRendererHost = new DaemonRendererHost({ terminal, verbosity });
    await host.initializeAsync();
    for (const operationId of [OPERATION_ID, 'warm-op']) {
      host.handleEvent({
        ...BASE_ENVELOPE,
        payload: { operationId, silent: false },
        type: 'operationRegistered'
      });
    }
    host.handleEvent(
      extension(RUSHD_OPERATION_HEADER, {
        completedOperations: EVENT_SEQUENCE,
        operationId: OPERATION_ID,
        totalOperations: EVENT_SEQUENCE
      })
    );
    host.handleLogChunk(OPERATION_ID, 'stderr', new TextEncoder().encode('failure\n'));
    host.handleEvent(extension(RUSHD_OPERATION_STREAM_CLOSED, { operationId: OPERATION_ID }));

    expect(terminal.stdout).toContain('1 of 1');
    expect(terminal.stdout).not.toContain('1 of 2');
    await host.closeAsync();
  }
});
