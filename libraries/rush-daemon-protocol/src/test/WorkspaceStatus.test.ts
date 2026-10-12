// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { decodeDaemonControlMessage, encodeDaemonControlMessage } from '../ControlFrameCodec';

import { GENERATION, INVALID_NUMBER, ZERO, statusFrame, workspaceStatus } from './WorkspaceStatusTestData';

it.each([undefined, { generation: GENERATION, graphInitialized: false }, workspaceStatus()])(
  'round-trips optional cold and warm workspace status',
  (workspace: unknown) => {
    const frame: Uint8Array = statusFrame(workspace);
    expect(encodeDaemonControlMessage(decodeDaemonControlMessage(frame))).toEqual(frame);
  }
);

it.each([
  null,
  [],
  {},
  { ...workspaceStatus(), generation: ZERO },
  { ...workspaceStatus(), generation: INVALID_NUMBER },
  { ...workspaceStatus(), generation: Number.POSITIVE_INFINITY },
  { ...workspaceStatus(), graphInitialized: 'true' },
  { ...workspaceStatus(), generationToken: undefined },
  { ...workspaceStatus(), generationToken: '' },
  { ...workspaceStatus(), graphInitialized: false }
])('rejects malformed or inconsistent workspace status', (workspace: unknown) => {
  expect(() => decodeDaemonControlMessage(statusFrame(workspace))).toThrow();
});
