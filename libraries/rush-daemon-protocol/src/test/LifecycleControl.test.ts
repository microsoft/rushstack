// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { decodeDaemonControlMessage, encodeDaemonControlMessage } from '../ControlFrameCodec';
import type { DaemonControlMessage } from '../DaemonControlMessage';

const PID: number = 42;
const MEMORY_BYTES: number = 1024;
const UPTIME_MS: number = 100;
const ZERO: number = 0;
const NEGATIVE: number = -1;
const FRACTION: number = 1.5;

const MESSAGES: readonly DaemonControlMessage[] = [
  { kind: 'shutdown', payload: {} },
  { kind: 'shutdownAck', payload: {} },
  { kind: 'pong', payload: { pid: PID, residentMemoryBytes: MEMORY_BYTES, uptimeMs: UPTIME_MS } }
];

it.each(MESSAGES)('round-trips lifecycle message $kind', (message: DaemonControlMessage) => {
  expect(decodeDaemonControlMessage(encodeDaemonControlMessage(message))).toEqual(message);
});

it.each([ZERO, NEGATIVE, FRACTION, '42'])('rejects an invalid daemon PID %s', (pid: unknown) => {
  const json: string = JSON.stringify({ kind: 'pong', payload: { pid, uptimeMs: UPTIME_MS } });
  expect(() => decodeDaemonControlMessage(new TextEncoder().encode(json))).toThrow('pid');
});

it.each([NEGATIVE, FRACTION, '1024'])('rejects invalid memory %s', (residentMemoryBytes: unknown) => {
  const json: string = JSON.stringify({
    kind: 'pong',
    payload: { residentMemoryBytes, uptimeMs: UPTIME_MS }
  });
  expect(() => decodeDaemonControlMessage(new TextEncoder().encode(json))).toThrow('residentMemoryBytes');
});
