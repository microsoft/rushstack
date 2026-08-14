// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IDaemonFrame } from './DaemonFrame';
import {
  FRAME_HEADER_BYTES,
  LENGTH_FIELD_OFFSET,
  PAYLOAD_OFFSET,
  TYPE_FIELD_OFFSET
} from './FrameConstants';

/**
 * Serializes a single frame as `[u32 LE payloadLength][u8 frameType][payload]`.
 *
 * @remarks
 * The length field counts only the payload bytes, never the header. The result
 * is a freshly allocated buffer, safe to retain or mutate by the caller.
 *
 * @beta
 */
export function encodeDaemonFrame(frame: IDaemonFrame): Buffer {
  const serialized: Buffer = Buffer.alloc(FRAME_HEADER_BYTES + frame.payload.length);
  serialized.writeUInt32LE(frame.payload.length, LENGTH_FIELD_OFFSET);
  serialized.writeUInt8(frame.type, TYPE_FIELD_OFFSET);
  frame.payload.copy(serialized, PAYLOAD_OFFSET);
  return serialized;
}

/**
 * Serializes a sequence of frames into one contiguous buffer.
 *
 * @param frames - the frames to serialize, in wire order
 *
 * @beta
 */
export function encodeDaemonFrames(frames: readonly IDaemonFrame[]): Buffer {
  const parts: Buffer[] = [];
  for (const frame of frames) {
    parts.push(encodeDaemonFrame(frame));
  }
  return Buffer.concat(parts);
}
