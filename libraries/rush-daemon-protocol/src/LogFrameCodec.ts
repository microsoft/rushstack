// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { DaemonProtocolError, DaemonProtocolErrorCode } from './DaemonProtocolError';
import {
  MAX_OPERATION_ID_BYTES,
  OPERATION_ID_LENGTH_BYTES,
  OPERATION_ID_LENGTH_OFFSET
} from './FrameConstants';

const UTF8: BufferEncoding = 'utf8';

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
  readonly chunk: Buffer;
}

/**
 * Serializes a log chunk as `[u16 LE operationIdBytes][operationId utf8][raw chunk]`.
 *
 * @throws {@link DaemonProtocolError} when the operation id exceeds
 * {@link MAX_OPERATION_ID_BYTES} bytes when UTF-8 encoded.
 *
 * @beta
 */
export function encodeDaemonLogChunk(log: IDaemonLogChunk): Buffer {
  const idBytes: Buffer = Buffer.from(log.operationId, UTF8);
  if (idBytes.length > MAX_OPERATION_ID_BYTES) {
    throw new DaemonProtocolError(
      DaemonProtocolErrorCode.malformedPayload,
      `Operation id is ${idBytes.length} bytes, exceeding the maximum of ${MAX_OPERATION_ID_BYTES}.`
    );
  }
  const payload: Buffer = Buffer.alloc(OPERATION_ID_LENGTH_BYTES + idBytes.length + log.chunk.length);
  payload.writeUInt16LE(idBytes.length, OPERATION_ID_LENGTH_OFFSET);
  idBytes.copy(payload, OPERATION_ID_LENGTH_BYTES);
  log.chunk.copy(payload, OPERATION_ID_LENGTH_BYTES + idBytes.length);
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
export function decodeDaemonLogChunk(payload: Buffer): IDaemonLogChunk {
  if (payload.length < OPERATION_ID_LENGTH_BYTES) {
    throw new DaemonProtocolError(
      DaemonProtocolErrorCode.malformedPayload,
      'Log frame payload is too short to contain an operation id length.'
    );
  }
  const idLength: number = payload.readUInt16LE(OPERATION_ID_LENGTH_OFFSET);
  const chunkOffset: number = OPERATION_ID_LENGTH_BYTES + idLength;
  if (payload.length < chunkOffset) {
    throw new DaemonProtocolError(
      DaemonProtocolErrorCode.malformedPayload,
      `Log frame declared an operation id of ${idLength} bytes but the payload is ${payload.length} bytes.`
    );
  }
  const operationId: string = payload.toString(UTF8, OPERATION_ID_LENGTH_BYTES, chunkOffset);
  const chunk: Buffer = Buffer.from(payload.subarray(chunkOffset));
  return { operationId, chunk };
}
