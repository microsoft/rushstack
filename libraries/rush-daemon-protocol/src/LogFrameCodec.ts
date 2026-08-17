// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { DaemonProtocolError } from './DaemonProtocolError';
import { WIRE_TEXT_DECODER, WIRE_TEXT_ENCODER } from './DaemonWireText';
import {
  MAX_OPERATION_ID_BYTES,
  OPERATION_ID_LENGTH_BYTES,
  OPERATION_ID_LENGTH_OFFSET
} from './FrameConstants';

const LITTLE_ENDIAN: boolean = true;

/**
 * An id-tagged chunk of one operation's raw output stream.
 *
 * @beta
 */
export interface IDaemonLogChunk {
  /**
   * The operation this chunk belongs to.
   */
  readonly operationId: string;

  /**
   * The raw stream bytes. May contain arbitrary (including non-UTF-8) content.
   */
  readonly chunk: Uint8Array;
}

/**
 * Serializes a log chunk as `[u16 LE operationIdBytes][operationId utf8][raw chunk]`.
 *
 * @remarks
 * The operation id is UTF-8 encoded exactly once; the resulting byte count is
 * measured from that encoding and the payload is allocated exactly once.
 *
 * @throws {@link DaemonProtocolError} when the operation id exceeds
 * {@link MAX_OPERATION_ID_BYTES} bytes when UTF-8 encoded.
 *
 * @beta
 */
export function encodeDaemonLogChunk(log: IDaemonLogChunk): Uint8Array {
  const idBytes: Uint8Array = WIRE_TEXT_ENCODER.encode(log.operationId);
  if (idBytes.length > MAX_OPERATION_ID_BYTES) {
    throw new DaemonProtocolError(
      'malformedPayload',
      `Operation id is ${idBytes.length} bytes, exceeding the maximum of ${MAX_OPERATION_ID_BYTES}.`
    );
  }
  const payload: Uint8Array = new Uint8Array(OPERATION_ID_LENGTH_BYTES + idBytes.length + log.chunk.length);
  new DataView(payload.buffer).setUint16(OPERATION_ID_LENGTH_OFFSET, idBytes.length, LITTLE_ENDIAN);
  payload.set(idBytes, OPERATION_ID_LENGTH_BYTES);
  payload.set(log.chunk, OPERATION_ID_LENGTH_BYTES + idBytes.length);
  return payload;
}

/**
 * Parses a log frame payload back into its operation id and raw chunk.
 *
 * @throws {@link DaemonProtocolError} when the payload is truncated or its
 * length prefix overruns the payload.
 *
 * @beta
 */
export function decodeDaemonLogChunk(payload: Uint8Array): IDaemonLogChunk {
  if (payload.length < OPERATION_ID_LENGTH_BYTES) {
    throw new DaemonProtocolError(
      'malformedPayload',
      'Log frame payload is too short to contain an operation id length.'
    );
  }
  const idLength: number = new DataView(payload.buffer, payload.byteOffset).getUint16(
    OPERATION_ID_LENGTH_OFFSET,
    LITTLE_ENDIAN
  );
  const chunkOffset: number = OPERATION_ID_LENGTH_BYTES + idLength;
  if (payload.length < chunkOffset) {
    throw new DaemonProtocolError(
      'malformedPayload',
      `Log frame declared an operation id of ${idLength} bytes but the payload is ${payload.length} bytes.`
    );
  }
  const operationId: string = WIRE_TEXT_DECODER.decode(
    payload.subarray(OPERATION_ID_LENGTH_BYTES, chunkOffset)
  );
  const chunk: Uint8Array = payload.slice(chunkOffset);
  return { operationId, chunk };
}
