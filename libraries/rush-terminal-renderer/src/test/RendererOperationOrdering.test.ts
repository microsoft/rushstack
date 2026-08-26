// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IDaemonEventEnvelope } from '@rushstack/rush-daemon-protocol';
import {
  RUSHD_OPERATION_HEADER,
  RUSHD_OPERATION_STREAM_CLOSED
} from '@rushstack/rush-daemon-protocol';

import { DaemonRendererHost } from '../DaemonRendererHost';

import { TestTerminal } from './TestTerminal';

const FIRST_OPERATION: string = 'op-a';
const SECOND_OPERATION: string = 'op-b';
const PROTOCOL_MAJOR: number = 0;
const FIRST_COUNT: number = 1;
const TOTAL_OPERATIONS: number = 2;
const BASE = {
  eventId: 'event',
  privacy: 'public',
  protocolVersion: { major: PROTOCOL_MAJOR, minor: FIRST_COUNT },
  required: true,
  sequence: FIRST_COUNT,
  sessionId: 'session',
  source: { packageName: 'test', packageVersion: '0' },
  timestamp: '2026-08-25T00:00:00.000Z'
} as const;

function event(
  type: 'activityChanged' | 'extension',
  payload: unknown,
  operationId?: string
): IDaemonEventEnvelope {
  return { ...BASE, payload, scope: operationId === undefined ? undefined : { operationId }, type };
}

function header(operationId: string, completedOperations: number): IDaemonEventEnvelope {
  return event('extension', {
    data: { completedOperations, operationId, totalOperations: TOTAL_OPERATIONS },
    name: RUSHD_OPERATION_HEADER
  });
}

it('buffers quiet activity until authoritative parallel headers arrive', async () => {
  const terminal: TestTerminal = new TestTerminal();
  const host: DaemonRendererHost = new DaemonRendererHost({ terminal, verbosity: 'quiet' });
  await host.initializeAsync();
  host.handleLogChunk(FIRST_OPERATION, 'stdout', new TextEncoder().encode('hidden\n'));
  host.handleEvent(
    event('activityChanged', { stream: 'stderr', text: 'second' }, SECOND_OPERATION)
  );
  expect(terminal.stdout).toBe('');

  host.handleEvent(header(FIRST_OPERATION, FIRST_COUNT));
  host.handleEvent(event('extension', {
    data: { operationId: FIRST_OPERATION },
    name: RUSHD_OPERATION_STREAM_CLOSED
  }));
  host.handleEvent(header(SECOND_OPERATION, TOTAL_OPERATIONS));
  host.handleEvent(event('extension', {
    data: { operationId: SECOND_OPERATION },
    name: RUSHD_OPERATION_STREAM_CLOSED
  }));

  expect(terminal.stdout).toContain('1 of 2');
  expect(terminal.stdout).toContain('2 of 2');
  expect(terminal.stdout).not.toContain('1 of 0');
  expect(terminal.stderr).toContain('second');
  await host.closeAsync();
});
