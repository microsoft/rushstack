// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IDaemonFrame } from '../DaemonFrame';
import { DaemonFrameType } from '../DaemonFrameType';
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

const ALL_KINDS: readonly DaemonFrameType[] = [
  DaemonFrameType.controlJson,
  DaemonFrameType.logStdout,
  DaemonFrameType.logStderr,
  DaemonFrameType.stdin,
  DaemonFrameType.event
];
const TINY_LIMIT: number = 8;
const UNKNOWN_KIND_BYTE: number = 0x7e;
const FIRST_SPLIT: number = 1;

function roundTrip(kind: DaemonFrameType, payload: Uint8Array): IDaemonFrame {
  const frames: IDaemonFrame[] = new DaemonFrameDecoder().push(encodeDaemonFrame({ kind, payload }));
  expect(frames).toHaveLength(SINGLE_COUNT);
  return frames[FIRST_INDEX];
}

function expectBytesEqual(actual: Uint8Array, expected: Uint8Array): void {
  expect(Buffer.from(actual).equals(Buffer.from(expected))).toBe(true);
}

it('round-trips every frame kind with non-UTF-8 payloads', () => {
  for (const kind of ALL_KINDS) {
    const frame: IDaemonFrame = roundTrip(kind, NON_UTF8_BYTES);
    expect(frame.kind).toBe(kind);
    expectBytesEqual(frame.payload, NON_UTF8_BYTES);
  }
});

it('decodes coalesced frames in wire order', () => {
  const first: IDaemonFrame = { kind: DaemonFrameType.logStdout, payload: Buffer.from('a') };
  const second: IDaemonFrame = { kind: DaemonFrameType.logStderr, payload: NON_UTF8_BYTES };
  const decoder: DaemonFrameDecoder = new DaemonFrameDecoder();
  for (const part of encodeDaemonFrames([first, second])) {
    const frames: IDaemonFrame[] = decoder.push(part);
    expect(frames).toHaveLength(SINGLE_COUNT);
  }
});

it('returns per-frame byte arrays without concatenating the batch', () => {
  const frames: IDaemonFrame[] = [
    { kind: DaemonFrameType.logStdout, payload: Buffer.from('a') },
    { kind: DaemonFrameType.logStderr, payload: NON_UTF8_BYTES }
  ];
  const parts: Uint8Array[] = encodeDaemonFrames(frames);
  expect(parts).toHaveLength(PAIR_COUNT);
  const merged: IDaemonFrame[] = new DaemonFrameDecoder().push(Buffer.concat(parts));
  expect(merged).toHaveLength(PAIR_COUNT);
  expectBytesEqual(merged[SINGLE_COUNT].payload, NON_UTF8_BYTES);
});

it('decodes a frame split at every possible byte boundary', () => {
  const encoded: Uint8Array = encodeDaemonFrame({ kind: DaemonFrameType.stdin, payload: NON_UTF8_BYTES });
  for (let splitAt: number = FIRST_SPLIT; splitAt < encoded.length; splitAt++) {
    const decoder: DaemonFrameDecoder = new DaemonFrameDecoder();
    expect(decoder.push(encoded.subarray(FIRST_INDEX, splitAt))).toHaveLength(EMPTY_COUNT);
    const frames: IDaemonFrame[] = decoder.push(encoded.subarray(splitAt));
    expect(frames).toHaveLength(SINGLE_COUNT);
    expectBytesEqual(frames[FIRST_INDEX].payload, NON_UTF8_BYTES);
  }
});

it('rejects an oversized payload declaration', () => {
  const header: Buffer = Buffer.alloc(FRAME_HEADER_BYTES);
  header.writeUInt32LE(TINY_LIMIT + SINGLE_COUNT, LENGTH_FIELD_OFFSET);
  header.writeUInt8(DaemonFrameType.logStdout, TYPE_FIELD_OFFSET);
  const decoder: DaemonFrameDecoder = new DaemonFrameDecoder({ maxPayloadBytes: TINY_LIMIT });
  const error: ReturnType<typeof captureProtocolError> = captureProtocolError(() => decoder.push(header));
  expect(error.code).toBe('frameTooLarge');
});

it('rejects an unknown frame kind byte', () => {
  const header: Buffer = Buffer.alloc(FRAME_HEADER_BYTES);
  header.writeUInt8(UNKNOWN_KIND_BYTE, TYPE_FIELD_OFFSET);
  const decoder: DaemonFrameDecoder = new DaemonFrameDecoder();
  const error: ReturnType<typeof captureProtocolError> = captureProtocolError(() => decoder.push(header));
  expect(error.code).toBe('unknownFrameType');
});
