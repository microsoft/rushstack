// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { decodeDaemonControlMessage, encodeDaemonControlMessage } from '../ControlFrameCodec';
import type { IDaemonRequestStartMessage } from '../DaemonRequestControl';

const NUMBER_FLAG: number = 1;

function createRequestStart(returnEarlyOnFailure: unknown): IDaemonRequestStartMessage {
  return {
    kind: 'requestStart',
    payload: {
      argv: ['build', '--to', 'project-a'],
      commandName: 'build',
      commandOrigin: 'built-in',
      cwd: '/repo',
      environment: {},
      requestId: 'early-failure-request',
      returnEarlyOnFailure: returnEarlyOnFailure as boolean | undefined,
      terminal: { isTTY: false, supportsColor: false }
    }
  };
}

function roundTrip(message: IDaemonRequestStartMessage): unknown {
  return decodeDaemonControlMessage(encodeDaemonControlMessage(message));
}

it.each([true, false, undefined])('round-trips returnEarlyOnFailure %p', (value: boolean | undefined) => {
  expect(roundTrip(createRequestStart(value))).toEqual(createRequestStart(value));
});

it.each(['true', NUMBER_FLAG, null])('rejects a non-boolean returnEarlyOnFailure %p', (value: unknown) => {
  expect(() => roundTrip(createRequestStart(value))).toThrow(
    'requestStart payload.returnEarlyOnFailure must be a boolean.'
  );
});
