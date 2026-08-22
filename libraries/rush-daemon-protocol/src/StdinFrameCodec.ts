// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { DaemonProtocolError } from './DaemonProtocolError';
import { WIRE_TEXT_DECODER, WIRE_TEXT_ENCODER } from './DaemonWireText';
import {
  MAX_REQUEST_ID_BYTES,
  REQUEST_ID_LENGTH_BYTES,
  REQUEST_ID_LENGTH_OFFSET
} from './FrameConstants';

const LITTLE_ENDIAN: boolean = true;

/** One request-tagged chunk of raw stdin bytes. @beta */
export interface IDaemonStdinChunk {
  /** Raw bytes that must not be decoded or re-encoded. */
  readonly chunk: Uint8Array;
  /** The active request that owns the input. */
  readonly requestId: string;
}

/** Serializes stdin as `[u16 LE requestIdBytes][requestId utf8][raw chunk]`. @beta */
export function encodeDaemonStdinChunk(input: IDaemonStdinChunk): Uint8Array {
  const idBytes: Uint8Array = WIRE_TEXT_ENCODER.encode(input.requestId);
  if (idBytes.length > MAX_REQUEST_ID_BYTES) {
    throw new DaemonProtocolError(
      'malformedPayload',
      `Request id is ${idBytes.length} bytes, exceeding the maximum of ${MAX_REQUEST_ID_BYTES}.`
    );
  }
  const payload: Uint8Array = new Uint8Array(REQUEST_ID_LENGTH_BYTES + idBytes.length + input.chunk.length);
  new DataView(payload.buffer).setUint16(REQUEST_ID_LENGTH_OFFSET, idBytes.length, LITTLE_ENDIAN);
  payload.set(idBytes, REQUEST_ID_LENGTH_BYTES);
  payload.set(input.chunk, REQUEST_ID_LENGTH_BYTES + idBytes.length);
  return payload;
}

/** Parses a stdin payload without interpreting or transforming its raw input bytes. @beta */
export function decodeDaemonStdinChunk(payload: Uint8Array): IDaemonStdinChunk {
  if (payload.length < REQUEST_ID_LENGTH_BYTES) {
    throw new DaemonProtocolError(
      'malformedPayload',
      'Stdin frame payload is too short to contain a request id length.'
    );
  }
  const idLength: number = new DataView(payload.buffer, payload.byteOffset).getUint16(
    REQUEST_ID_LENGTH_OFFSET,
    LITTLE_ENDIAN
  );
  const chunkOffset: number = REQUEST_ID_LENGTH_BYTES + idLength;
  if (payload.length < chunkOffset) {
    throw new DaemonProtocolError(
      'malformedPayload',
      `Stdin frame declared a request id of ${idLength} bytes but the payload is ${payload.length} bytes.`
    );
  }
  return {
    chunk: payload.slice(chunkOffset),
    requestId: WIRE_TEXT_DECODER.decode(payload.subarray(REQUEST_ID_LENGTH_BYTES, chunkOffset))
  };
}
