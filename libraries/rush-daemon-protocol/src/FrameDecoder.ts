// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IDaemonFrame } from './DaemonFrame';
import { isDaemonFrameType } from './DaemonFrameType';
import { DaemonProtocolError, DaemonProtocolErrorCode } from './DaemonProtocolError';
import {
  DEFAULT_MAX_PAYLOAD_BYTES,
  FRAME_HEADER_BYTES,
  LENGTH_FIELD_OFFSET,
  TYPE_FIELD_OFFSET
} from './FrameConstants';

/** Options for {@link DaemonFrameDecoder}. @beta */
export interface IDaemonFrameDecoderOptions {
  /** The maximum accepted payload size of a single frame, in bytes. */
  readonly maxPayloadBytes?: number;
}

const EMPTY_LENGTH: number = 0;
const EMPTY_BUFFER: Buffer = Buffer.alloc(EMPTY_LENGTH);
const HEX_RADIX: number = 16;

/**
 * An incremental, streaming decoder for length-prefixed rushd frames.
 *
 * @remarks
 * Feed arbitrarily split or coalesced chunks to {@link DaemonFrameDecoder.push | push};
 * complete frames are returned in wire order. Payloads are copied out of the
 * receive buffer, so retained frames never pin a larger slab.
 * @beta
 */
export class DaemonFrameDecoder {
  private _pending: Buffer;
  private readonly _maxPayloadBytes: number;

  public constructor(options?: IDaemonFrameDecoderOptions) {
    this._pending = EMPTY_BUFFER;
    this._maxPayloadBytes = options?.maxPayloadBytes ?? DEFAULT_MAX_PAYLOAD_BYTES;
  }

  /**
   * Feeds received bytes and returns every frame completed by them.
   * @throws {@link DaemonProtocolError} when a header is invalid; tear down the connection.
   */
  public push(chunk: Buffer): IDaemonFrame[] {
    const pending: Buffer = this._pending;
    this._pending = pending.length === EMPTY_LENGTH ? chunk : Buffer.concat([pending, chunk]);
    const frames: IDaemonFrame[] = [];
    let frame: IDaemonFrame | undefined = this._tryExtractFrame();
    while (frame !== undefined) {
      frames.push(frame);
      frame = this._tryExtractFrame();
    }
    return frames;
  }

  /** Discards any buffered partial frame. */
  public reset(): void {
    this._pending = EMPTY_BUFFER;
  }

  private _tryExtractFrame(): IDaemonFrame | undefined {
    if (this._pending.length < FRAME_HEADER_BYTES) {
      return undefined;
    }
    const payloadLength: number = this._pending.readUInt32LE(LENGTH_FIELD_OFFSET);
    this._assertPayloadLength(payloadLength);
    const frameBytes: number = FRAME_HEADER_BYTES + payloadLength;
    if (this._pending.length < frameBytes) {
      return undefined;
    }
    return this._takeFrame(frameBytes);
  }

  private _assertPayloadLength(payloadLength: number): void {
    if (payloadLength > this._maxPayloadBytes) {
      const message: string = `Frame payload of ${payloadLength} bytes exceeds the maximum of ${this._maxPayloadBytes}.`;
      throw new DaemonProtocolError(DaemonProtocolErrorCode.frameTooLarge, message);
    }
  }

  private _takeFrame(frameBytes: number): IDaemonFrame {
    const typeByte: number = this._pending.readUInt8(TYPE_FIELD_OFFSET);
    this._assertKnownType(typeByte);
    const payload: Buffer = Buffer.from(this._pending.subarray(FRAME_HEADER_BYTES, frameBytes));
    this._pending = this._pending.subarray(frameBytes);
    return { type: typeByte, payload };
  }

  private _assertKnownType(typeByte: number): void {
    if (!isDaemonFrameType(typeByte)) {
      throw new DaemonProtocolError(
        DaemonProtocolErrorCode.unknownFrameType,
        `Frame declared an unknown frame type byte 0x${typeByte.toString(HEX_RADIX)}.`
      );
    }
  }
}
