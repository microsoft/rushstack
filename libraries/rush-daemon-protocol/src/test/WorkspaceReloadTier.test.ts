// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { decodeDaemonControlMessage, encodeDaemonControlMessage } from '../ControlFrameCodec';

import { statusFrame, workspaceStatus } from './WorkspaceStatusTestData';

const REUSE: number = 0;
const RELOAD: number = 1;
const RESTART: number = 2;
const INVALID_TIER: number = 3;
const NEGATIVE_TIER: number = -1;
const FRACTION: number = 0.5;

it.each([undefined, REUSE, RELOAD, RESTART])('round-trips lifecycle tier %s', (lastReloadTier: unknown) => {
  const frame: Uint8Array = statusFrame({ ...workspaceStatus(), lastReloadTier });
  expect(encodeDaemonControlMessage(decodeDaemonControlMessage(frame))).toEqual(frame);
});

it.each([null, false, '0', INVALID_TIER, NEGATIVE_TIER, FRACTION, Number.MAX_SAFE_INTEGER])(
  'rejects malformed lifecycle tier %s',
  (lastReloadTier: unknown) => {
    const frame: Uint8Array = statusFrame({ ...workspaceStatus(), lastReloadTier });
    expect(() => decodeDaemonControlMessage(frame)).toThrow();
  }
);
