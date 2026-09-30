// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { decodeDaemonControlMessage, encodeDaemonControlMessage } from '../ControlFrameCodec';
import { WIRE_TEXT_ENCODER } from '../DaemonWireText';

import { statusFrame, workspaceStatus } from './WorkspaceStatusTestData';

const FIRST_POSITION: number = 1;
const REQUEST_ID: string = 'waits-for-continuing-work';

const WELL_FORMED: ReadonlyArray<unknown> = [
  { count: 1, names: ['a (build)'] },
  { count: 5, names: ['a (build)', 'b (build)', 'c (build)'] },
  { count: 2, names: [] }
];

const MALFORMED: ReadonlyArray<unknown> = [
  null,
  [],
  'a (build)',
  { names: [] },
  { count: 0, names: [] },
  { count: 1.5, names: [] },
  { count: '2', names: [] },
  { count: 1 },
  { count: 1, names: 'a (build)' },
  { count: 1, names: ['a (build)', 'b (build)'] },
  { count: 1, names: [''] },
  { count: 1, names: [{ name: 'a (build)' }] }
];

function queuePositionFrame(continuingOperations: unknown): Uint8Array {
  const payload: object = { position: FIRST_POSITION, requestId: REQUEST_ID, continuingOperations };
  return WIRE_TEXT_ENCODER.encode(JSON.stringify({ kind: 'queuePosition', payload }));
}

function continuingStatusFrame(continuingOperations: unknown): Uint8Array {
  return statusFrame({ ...workspaceStatus(), continuingOperations });
}

it.each(WELL_FORMED)('round-trips a queue position behind continuing operations %j', (value: unknown) => {
  const frame: Uint8Array = queuePositionFrame(value);
  expect(encodeDaemonControlMessage(decodeDaemonControlMessage(frame))).toEqual(frame);
});

it.each(WELL_FORMED)('round-trips a workspace status with continuing operations %j', (value: unknown) => {
  const frame: Uint8Array = continuingStatusFrame(value);
  expect(encodeDaemonControlMessage(decodeDaemonControlMessage(frame))).toEqual(frame);
});

it.each(MALFORMED)('rejects a queue position with malformed continuing operations %j', (value: unknown) => {
  expect(() => decodeDaemonControlMessage(queuePositionFrame(value))).toThrow(/continuingOperations/);
});

it.each(MALFORMED)('rejects a workspace status with malformed continuing operations %j', (value: unknown) => {
  expect(() => decodeDaemonControlMessage(continuingStatusFrame(value))).toThrow(/continuingOperations/);
});
