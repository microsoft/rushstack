// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IDaemonFrame } from '../DaemonFrame';
import { DaemonFrameType } from '../DaemonFrameType';
import { MAX_OPERATION_ID_BYTES } from '../FrameConstants';
import { DaemonFrameDecoder } from '../FrameDecoder';
import { encodeDaemonFrame } from '../FrameEncoder';
import { decodeDaemonLogChunk, encodeDaemonLogChunk } from '../LogFrameCodec';

import { FIRST_INDEX, NON_UTF8_BYTES, SINGLE_COUNT, captureProtocolError } from './TestVectors';

const TOO_LONG_ID_BYTES: number = MAX_OPERATION_ID_BYTES + SINGLE_COUNT;
const DECLARED_ID_BYTES: number = 100;
const SHORT_PAYLOAD_BYTES: number = 1;
const TRUNCATED_PREFIX_BYTES: number = 2;
const EMPTY_BYTES: number = 0;
const WIRE_DECODER: InstanceType<typeof TextDecoder> = new TextDecoder();

/** One step of the interleaving plan: [operationId, text, kind]. */
const INTERLEAVE_PLAN: readonly [string, string, DaemonFrameType][] = [
  ['op-a', 'a1', DaemonFrameType.logStdout],
  ['op-b', 'b1', DaemonFrameType.logStderr],
  ['op-a', 'a2', DaemonFrameType.logStdout]
];

function expectBytesEqual(actual: Uint8Array, expected: Uint8Array): void {
  expect(Buffer.from(actual).equals(Buffer.from(expected))).toBe(true);
}

it('round-trips an id-tagged log chunk with non-UTF-8 bytes', () => {
  const decoded: ReturnType<typeof decodeDaemonLogChunk> = decodeDaemonLogChunk(
    encodeDaemonLogChunk({ operationId: 'build#my-app', chunk: NON_UTF8_BYTES })
  );
  expect(decoded.operationId).toBe('build#my-app');
  expectBytesEqual(decoded.chunk, NON_UTF8_BYTES);
});

function decodeStep(
  decoder: DaemonFrameDecoder,
  step: readonly [string, string, DaemonFrameType]
): [string, string][] {
  const [operationId, text, kind] = step;
  const frames: IDaemonFrame[] = decoder.push(
    encodeDaemonFrame({ kind, payload: encodeDaemonLogChunk({ operationId, chunk: Buffer.from(text) }) })
  );
  return frames.map(
    (frame: IDaemonFrame) =>
      [operationId, WIRE_DECODER.decode(decodeDaemonLogChunk(frame.payload).chunk)] as [string, string]
  );
}

function routeStep(
  decoder: DaemonFrameDecoder,
  step: readonly [string, string, DaemonFrameType],
  sinks: Map<string, string[]>
): void {
  for (const [operationId, text] of decodeStep(decoder, step)) {
    sinks.get(operationId)?.push(text);
  }
}

it('reassembles interleaved per-operation streams without reordering', () => {
  const decoder: DaemonFrameDecoder = new DaemonFrameDecoder();
  const sinks: Map<string, string[]> = new Map([
    ['op-a', []],
    ['op-b', []]
  ]);
  for (const step of INTERLEAVE_PLAN) {
    routeStep(decoder, step, sinks);
  }
  expect(sinks.get('op-a')).toEqual(['a1', 'a2']);
  expect(sinks.get('op-b')).toEqual(['b1']);
});

it('rejects an operation id longer than the u16 range', () => {
  const operationId: string = 'x'.repeat(TOO_LONG_ID_BYTES);
  const error: ReturnType<typeof captureProtocolError> = captureProtocolError(() =>
    encodeDaemonLogChunk({ operationId, chunk: new Uint8Array(EMPTY_BYTES) })
  );
  expect(error.code).toBe('malformedPayload');
});

it('rejects a truncated log payload', () => {
  const error: ReturnType<typeof captureProtocolError> = captureProtocolError(() =>
    decodeDaemonLogChunk(new Uint8Array(SHORT_PAYLOAD_BYTES))
  );
  expect(error.code).toBe('malformedPayload');
});

it('rejects a log payload whose id prefix overruns it', () => {
  const payload: Buffer = Buffer.alloc(TRUNCATED_PREFIX_BYTES + SHORT_PAYLOAD_BYTES);
  payload.writeUInt16LE(DECLARED_ID_BYTES, FIRST_INDEX);
  const error: ReturnType<typeof captureProtocolError> = captureProtocolError(() =>
    decodeDaemonLogChunk(payload)
  );
  expect(error.code).toBe('malformedPayload');
});
