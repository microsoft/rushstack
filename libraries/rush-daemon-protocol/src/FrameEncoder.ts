// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IDaemonFrame } from './DaemonFrame';
import {
  FRAME_HEADER_BYTES,
  LENGTH_FIELD_OFFSET,
  TYPE_FIELD_OFFSET
} from './FrameConstants';

const LITTLE_ENDIAN: boolean = true;

/**
 * Serializes a single frame as `[u32 LE payloadLength][u8 frameKind][payload]`.
 *
 * @remarks
 * The length field counts only the payload bytes, never the header. The result
 * is a freshly allocated array, safe to retain or mutate by the caller.
 *
 * @beta
 */
export function encodeDaemonFrame(frame: IDaemonFrame): Uint8Array {
  const serialized: Uint8Array = new Uint8Array(FRAME_HEADER_BYTES + frame.payload.length);
  const view: DataView = new DataView(serialized.buffer);
  view.setUint32(LENGTH_FIELD_OFFSET, frame.payload.length, LITTLE_ENDIAN);
  view.setUint8(TYPE_FIELD_OFFSET, frame.kind);
  serialized.set(frame.payload, FRAME_HEADER_BYTES);
  return serialized;
}

/**
 * Serializes a sequence of frames into an array of per-frame byte arrays, in
 * wire order.
 *
 * @remarks
 * The frames are deliberately NOT concatenated: the transport writes each part
 * sequentially (for example with `socket.cork()`/`uncork()`), avoiding a full
 * copy of the batch.
 *
 * @beta
 */
export function encodeDaemonFrames(frames: readonly IDaemonFrame[]): Uint8Array[] {
  const parts: Uint8Array[] = [];
  for (const frame of frames) {
    parts.push(encodeDaemonFrame(frame));
  }
  return parts;
}
