// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { DaemonFrameType } from '../DaemonFrameType';
import { DaemonProtocolErrorCode } from '../DaemonProtocolError';
import { MAX_OPERATION_ID_BYTES } from '../FrameConstants';
import { DaemonFrameDecoder } from '../FrameDecoder';
import { encodeDaemonFrame } from '../FrameEncoder';
import { decodeDaemonLogChunk, encodeDaemonLogChunk } from '../LogFrameCodec';

import { FIRST_INDEX, NON_UTF8_BYTES, SINGLE_COUNT, captureProtocolError } from './TestVectors';

const TOO_LONG_ID_BYTES: number = MAX_OPERATION_ID_BYTES + SINGLE_COUNT;
const DECLARED_ID_BYTES: number = 100;
const SHORT_PAYLOAD_BYTES: number = 1;
const TRUNCATED_ID_BYTES: number = 2;
const STREAM_PARITY: number = 2;

it('round-trips an id-tagged log chunk with non-UTF-8 bytes', () => {
  const decoded: ReturnType<typeof decodeDaemonLogChunk> = decodeDaemonLogChunk(
    encodeDaemonLogChunk({ operationId: 'build#my-app', chunk: NON_UTF8_BYTES })
  );
  expect(decoded.operationId).toBe('build#my-app');
  expect(decoded.chunk.equals(NON_UTF8_BYTES)).toBe(true);
});

it('reassembles interleaved per-operation streams without reordering', () => {
  const firstA: Buffer = Buffer.from('a1');
  const secondA: Buffer = Buffer.from('a2');
  const firstB: Buffer = Buffer.from('b1');
  const wire: Buffer = Buffer.concat(
    [firstA, firstB, secondA].map((chunk: Buffer, index: number) =>
      encodeDaemonFrame({
        type: index % STREAM_PARITY === FIRST_INDEX ? DaemonFrameType.logStdout : DaemonFrameType.logStderr,
        payload: encodeDaemonLogChunk({
          operationId: index % STREAM_PARITY === FIRST_INDEX ? 'op-a' : 'op-b',
          chunk
        })
      })
  ));
  const decoder: DaemonFrameDecoder = new DaemonFrameDecoder();
  const stdout: string[] = [];
  const stderr: string[] = [];
  for (const frame of decoder.push(wire)) {
    const log: ReturnType<typeof decodeDaemonLogChunk> = decodeDaemonLogChunk(frame.payload);
    const sink: string[] = log.operationId === 'op-a' ? stdout : stderr;
    sink.push(log.chunk.toString());
  }
  expect(stdout).toEqual(['a1', 'a2']);
  expect(stderr).toEqual(['b1']);
});

it('rejects an operation id longer than the u16 range', () => {
  const operationId: string = 'x'.repeat(TOO_LONG_ID_BYTES);
  const error: ReturnType<typeof captureProtocolError> = captureProtocolError(() =>
    encodeDaemonLogChunk({ operationId, chunk: Buffer.alloc(FIRST_INDEX) })
  );
  expect(error.code).toBe(DaemonProtocolErrorCode.malformedPayload);
});

it('rejects a truncated log payload', () => {
  const error: ReturnType<typeof captureProtocolError> = captureProtocolError(() =>
    decodeDaemonLogChunk(Buffer.alloc(SHORT_PAYLOAD_BYTES))
  );
  expect(error.code).toBe(DaemonProtocolErrorCode.malformedPayload);
});

it('rejects a log payload whose id prefix overruns it', () => {
  const payload: Buffer = Buffer.alloc(TRUNCATED_ID_BYTES + SHORT_PAYLOAD_BYTES);
  payload.writeUInt16LE(DECLARED_ID_BYTES, FIRST_INDEX);
  const error: ReturnType<typeof captureProtocolError> = captureProtocolError(() =>
    decodeDaemonLogChunk(payload)
  );
  expect(error.code).toBe(DaemonProtocolErrorCode.malformedPayload);
});
