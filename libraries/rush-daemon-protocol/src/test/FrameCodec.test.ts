// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IDaemonFrame } from '../DaemonFrame';
import { DaemonFrameType } from '../DaemonFrameType';
import { DaemonProtocolErrorCode } from '../DaemonProtocolError';
import { FRAME_HEADER_BYTES, LENGTH_FIELD_OFFSET, TYPE_FIELD_OFFSET } from '../FrameConstants';
import { DaemonFrameDecoder } from '../FrameDecoder';
import { encodeDaemonFrame, encodeDaemonFrames } from '../FrameEncoder';

import {
  EMPTY_COUNT,
  FIRST_INDEX,
  NON_UTF8_BYTES,
  PAIR_COUNT,
  SINGLE_COUNT,
  captureProtocolError
} from './TestVectors';

const ALL_TYPES: readonly DaemonFrameType[] = [
  DaemonFrameType.controlJson,
  DaemonFrameType.logStdout,
  DaemonFrameType.logStderr,
  DaemonFrameType.stdin,
  DaemonFrameType.event
];
const TINY_LIMIT: number = 8;
const UNKNOWN_TYPE_BYTE: number = 0x7e;
const FIRST_SPLIT: number = 1;

function roundTrip(type: DaemonFrameType, payload: Buffer): IDaemonFrame {
  const frames: IDaemonFrame[] = new DaemonFrameDecoder().push(encodeDaemonFrame({ type, payload }));
  expect(frames).toHaveLength(SINGLE_COUNT);
  return frames[FIRST_INDEX];
}

it('round-trips every frame type with non-UTF-8 payloads', () => {
  for (const type of ALL_TYPES) {
    const frame: IDaemonFrame = roundTrip(type, NON_UTF8_BYTES);
    expect(frame.type).toBe(type);
    expect(frame.payload.equals(NON_UTF8_BYTES)).toBe(true);
  }
});

it('decodes coalesced frames in wire order', () => {
  const first: IDaemonFrame = { type: DaemonFrameType.logStdout, payload: Buffer.from('a') };
  const second: IDaemonFrame = { type: DaemonFrameType.logStderr, payload: NON_UTF8_BYTES };
  const frames: IDaemonFrame[] = new DaemonFrameDecoder().push(encodeDaemonFrames([first, second]));
  expect(frames).toHaveLength(PAIR_COUNT);
  expect(frames[FIRST_INDEX].type).toBe(DaemonFrameType.logStdout);
  expect(frames[SINGLE_COUNT].payload.equals(NON_UTF8_BYTES)).toBe(true);
});

it('decodes a frame split at every possible byte boundary', () => {
  const encoded: Buffer = encodeDaemonFrame({ type: DaemonFrameType.stdin, payload: NON_UTF8_BYTES });
  for (let splitAt: number = FIRST_SPLIT; splitAt < encoded.length; splitAt++) {
    const decoder: DaemonFrameDecoder = new DaemonFrameDecoder();
    expect(decoder.push(encoded.subarray(FIRST_INDEX, splitAt))).toHaveLength(EMPTY_COUNT);
    const frames: IDaemonFrame[] = decoder.push(encoded.subarray(splitAt));
    expect(frames).toHaveLength(SINGLE_COUNT);
    expect(frames[FIRST_INDEX].payload.equals(NON_UTF8_BYTES)).toBe(true);
  }
});

it('rejects an oversized payload declaration', () => {
  const header: Buffer = Buffer.alloc(FRAME_HEADER_BYTES);
  header.writeUInt32LE(TINY_LIMIT + SINGLE_COUNT, LENGTH_FIELD_OFFSET);
  header.writeUInt8(DaemonFrameType.logStdout, TYPE_FIELD_OFFSET);
  const decoder: DaemonFrameDecoder = new DaemonFrameDecoder({ maxPayloadBytes: TINY_LIMIT });
  const error: ReturnType<typeof captureProtocolError> = captureProtocolError(() => decoder.push(header));
  expect(error.code).toBe(DaemonProtocolErrorCode.frameTooLarge);
});

it('rejects an unknown frame type byte', () => {
  const header: Buffer = Buffer.alloc(FRAME_HEADER_BYTES);
  header.writeUInt8(UNKNOWN_TYPE_BYTE, TYPE_FIELD_OFFSET);
  const decoder: DaemonFrameDecoder = new DaemonFrameDecoder();
  const error: ReturnType<typeof captureProtocolError> = captureProtocolError(() => decoder.push(header));
  expect(error.code).toBe(DaemonProtocolErrorCode.unknownFrameType);
});
