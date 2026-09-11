// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { decodeDaemonControlMessage, encodeDaemonControlMessage } from '../ControlFrameCodec';
import type { DaemonControlMessage } from '../DaemonControlMessage';
import type { IDaemonRequestStartMessage } from '../DaemonRequestControl';

function request(invocationKind: unknown): IDaemonRequestStartMessage {
  const message: unknown = {
    kind: 'requestStart',
    payload: {
      argv: ['build'], commandName: 'build', commandOrigin: 'custom',
      cwd: '/repo/project', environment: {}, invocationKind, requestId: 'rushx',
      terminal: { isTTY: false, supportsColor: false }
    }
  };
  return message as IDaemonRequestStartMessage;
}

it.each([undefined, 'rush', 'rushx'])('round-trips invocation kind %s', (kind: unknown) => {
  const message: DaemonControlMessage = request(kind);
  expect(decodeDaemonControlMessage(encodeDaemonControlMessage(message))).toEqual(message);
});

it.each(['script', '', null, true, {}])('rejects invalid invocation kind %s', (kind: unknown) => {
  expect(() => decodeDaemonControlMessage(encodeDaemonControlMessage(request(kind)))).toThrow(
    'Request invocation kind is not recognized.'
  );
});
