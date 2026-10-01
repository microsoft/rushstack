// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { decodeDaemonControlMessage, encodeDaemonControlMessage } from '../ControlFrameCodec';
import type { DaemonControlMessage } from '../DaemonControlMessage';
import type { IDaemonPingPayload } from '../DaemonPongMessage';

import { captureProtocolError } from './TestVectors';

it.each<IDaemonPingPayload>([{}, { omitWarmSet: true }, { omitWarmSet: false }])(
  'round-trips a ping whose payload is %j',
  (payload: IDaemonPingPayload) => {
    const message: DaemonControlMessage = { kind: 'ping', payload };
    expect(decodeDaemonControlMessage(encodeDaemonControlMessage(message))).toEqual(message);
  }
);

it('rejects a ping whose omitWarmSet is not a boolean', () => {
  const error: ReturnType<typeof captureProtocolError> = captureProtocolError(() =>
    decodeDaemonControlMessage(Buffer.from('{"kind":"ping","payload":{"omitWarmSet":"yes"}}'))
  );
  expect(error.code).toBe('malformedControlMessage');
});
