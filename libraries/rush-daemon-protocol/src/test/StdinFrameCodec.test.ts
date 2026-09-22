// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IDaemonFrame } from '../DaemonFrame';
import { DaemonFrameType } from '../DaemonFrameType';
import { MAX_REQUEST_ID_BYTES } from '../FrameConstants';
import { DaemonFrameDecoder } from '../FrameDecoder';
import { encodeDaemonFrame } from '../FrameEncoder';
import { decodeDaemonStdinChunk, encodeDaemonStdinChunk } from '../StdinFrameCodec';

import { FIRST_INDEX, NON_UTF8_BYTES, SINGLE_COUNT, captureProtocolError } from './TestVectors';

const EMPTY_BYTES: number = 0;
const FIRST_INPUT_BYTE: number = 0xff;
const SECOND_INPUT_BYTE: number = 0x00;
const THIRD_INPUT_BYTE: number = 0x80;
const SPLIT_OFFSET: number = 3;
const TOO_LONG_ID_BYTES: number = MAX_REQUEST_ID_BYTES + SINGLE_COUNT;

function expectBytesEqual(actual: Uint8Array, expected: Uint8Array): void {
  expect(Buffer.from(actual).equals(Buffer.from(expected))).toBe(true);
}

it('round-trips request-tagged non-UTF-8 stdin without transforming bytes', () => {
  const decoded: ReturnType<typeof decodeDaemonStdinChunk> = decodeDaemonStdinChunk(
    encodeDaemonStdinChunk({ chunk: NON_UTF8_BYTES, requestId: 'request-a' })
  );
  expect(decoded.requestId).toBe('request-a');
  expectBytesEqual(decoded.chunk, NON_UTF8_BYTES);
});

it('preserves split and interleaved stdin frame boundaries', () => {
  const decoder: DaemonFrameDecoder = new DaemonFrameDecoder();
  const frames: Uint8Array[] = [
    encodeDaemonFrame({
      kind: DaemonFrameType.stdin,
      payload: encodeDaemonStdinChunk({ chunk: Uint8Array.of(FIRST_INPUT_BYTE), requestId: 'request-a' })
    }),
    encodeDaemonFrame({
      kind: DaemonFrameType.stdin,
      payload: encodeDaemonStdinChunk({ chunk: Uint8Array.of(SECOND_INPUT_BYTE), requestId: 'request-b' })
    }),
    encodeDaemonFrame({
      kind: DaemonFrameType.stdin,
      payload: encodeDaemonStdinChunk({ chunk: Uint8Array.of(THIRD_INPUT_BYTE), requestId: 'request-a' })
    })
  ];
  const wire: Buffer = Buffer.concat(frames.map((frame: Uint8Array) => Buffer.from(frame)));
  const decodedFrames: IDaemonFrame[] = [
    ...decoder.push(wire.subarray(FIRST_INDEX, SPLIT_OFFSET)),
    ...decoder.push(wire.subarray(SPLIT_OFFSET))
  ];
  const decoded = decodedFrames.map((frame: IDaemonFrame) => decodeDaemonStdinChunk(frame.payload));
  expect(decoded.map(({ requestId }) => requestId)).toEqual(['request-a', 'request-b', 'request-a']);
  expect(decoded.map(({ chunk }) => chunk[FIRST_INDEX])).toEqual([
    FIRST_INPUT_BYTE,
    SECOND_INPUT_BYTE,
    THIRD_INPUT_BYTE
  ]);
});

it('rejects malformed request id prefixes', () => {
  expect(() => encodeDaemonStdinChunk({
    chunk: new Uint8Array(EMPTY_BYTES),
    requestId: 'x'.repeat(TOO_LONG_ID_BYTES)
  })).toThrow();
  expect(captureProtocolError(() => decodeDaemonStdinChunk(Uint8Array.of(SINGLE_COUNT))).code).toBe(
    'malformedPayload'
  );
  const malformedIdPayload: Uint8Array = Uint8Array.of(
    NON_UTF8_BYTES.length,
    EMPTY_BYTES,
    ...NON_UTF8_BYTES
  );
  expect(captureProtocolError(() => decodeDaemonStdinChunk(malformedIdPayload)).code).toBe(
    'malformedPayload'
  );
});
