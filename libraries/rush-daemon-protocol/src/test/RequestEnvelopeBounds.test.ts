// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { decodeDaemonControlMessage, encodeDaemonControlMessage } from '../ControlFrameCodec';
import type { DaemonControlMessage } from '../DaemonControlMessage';
import { MAX_DAEMON_REQUEST_WAIT_TIMEOUT_MS } from '../DaemonRequestAdmission';
import { MAX_REQUEST_ID_BYTES } from '../FrameConstants';

const OUT_OF_RANGE_INCREMENT: number = 1;

function rejectsEnvelope(payload: Record<string, unknown>): void {
  const message = { kind: 'requestStart', payload } as unknown as DaemonControlMessage;
  expect(() => decodeDaemonControlMessage(encodeDaemonControlMessage(message))).toThrow();
}

it('rejects request ids that cannot be represented in binary request frames', () => {
  rejectsEnvelope({
    argv: ['build'],
    commandName: 'build',
    commandOrigin: 'built-in',
    cwd: 'C:\\repo',
    environment: {},
    requestId: 'x'.repeat(MAX_REQUEST_ID_BYTES + OUT_OF_RANGE_INCREMENT),
    terminal: { isTTY: false, supportsColor: false }
  });
});

it('rejects wait timeouts beyond the scheduler timer range', () => {
  rejectsEnvelope({
    admission: { waitTimeoutMs: MAX_DAEMON_REQUEST_WAIT_TIMEOUT_MS + OUT_OF_RANGE_INCREMENT },
    argv: ['build'],
    commandName: 'build',
    commandOrigin: 'built-in',
    cwd: 'C:\\repo',
    environment: {},
    requestId: 'request',
    terminal: { isTTY: false, supportsColor: false }
  });
});
