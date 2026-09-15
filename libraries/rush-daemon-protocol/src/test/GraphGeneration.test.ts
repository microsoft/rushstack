// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { decodeDaemonControlMessage, encodeDaemonControlMessage } from '../ControlFrameCodec';
import type { IDaemonRequestStartMessage } from '../DaemonRequestControl';
import { MAX_REQUEST_ID_BYTES } from '../FrameConstants';

const OUT_OF_RANGE_INCREMENT: number = 1;

function request(expectedWorkspaceGeneration: unknown): IDaemonRequestStartMessage {
  const message: unknown = {
    kind: 'requestStart',
    payload: {
      argv: ['daemon', 'graph', 'pause'], commandName: 'daemon', commandOrigin: 'built-in',
      cwd: '/repo', environment: {}, expectedWorkspaceGeneration, requestId: 'graph',
      terminal: { isTTY: false, supportsColor: false }
    }
  };
  return message as IDaemonRequestStartMessage;
}

it.each([undefined, 'session-generation-token'])('round-trips generation %s', (token: unknown) => {
  const message: IDaemonRequestStartMessage = request(token);
  expect(decodeDaemonControlMessage(encodeDaemonControlMessage(message))).toEqual(message);
});

it.each(['', null, true, {}, 'x'.repeat(MAX_REQUEST_ID_BYTES + OUT_OF_RANGE_INCREMENT)])(
  'rejects invalid generation %s', (token: unknown) => {
    expect(() => decodeDaemonControlMessage(encodeDaemonControlMessage(request(token)))).toThrow();
  }
);
