// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IDaemonFrame } from './DaemonFrame';
import { isDaemonFrameType } from './DaemonFrameType';
import { DaemonProtocolError } from './DaemonProtocolError';
import {
  DEFAULT_MAX_PAYLOAD_BYTES,
  FRAME_HEADER_BYTES,
  LENGTH_FIELD_OFFSET,
  TYPE_FIELD_OFFSET
} from './FrameConstants';
import { SegmentBuffer } from './SegmentBuffer';

/** Options for {@link DaemonFrameDecoder}. @beta */
export interface IDaemonFrameDecoderOptions {
  /** The maximum accepted payload size of a single frame, in bytes. */
  readonly maxPayloadBytes?: number;
}
const HEX_RADIX: number = 16;
const SINGLE_BYTE: number = 1;
const LITTLE_ENDIAN: boolean = true;

/**
 * An incremental, streaming decoder for length-prefixed rushd frames.
 *
 * @remarks
 * Feed arbitrarily split or coalesced chunks to {@link DaemonFrameDecoder.push | push};
 * complete frames are returned in wire order. Received bytes accumulate in a segment
 * list (never concatenated per push); payloads copy out once per completed frame.
 * @beta
 */
export class DaemonFrameDecoder {
  #pending: SegmentBuffer;
  readonly #maxPayloadBytes: number;

  public constructor(options?: IDaemonFrameDecoderOptions) {
    this.#pending = new SegmentBuffer();
    this.#maxPayloadBytes = options?.maxPayloadBytes ?? DEFAULT_MAX_PAYLOAD_BYTES;
  }

  /** Feeds received bytes and returns every frame completed by them.
   * @throws {@link DaemonProtocolError} when a header is invalid; tear down the connection. */
  public push(chunk: Uint8Array): IDaemonFrame[] {
    this.#pending.push(chunk);
    const frames: IDaemonFrame[] = [];
    let frame: IDaemonFrame | undefined = this.#tryExtractFrame();
    while (frame !== undefined) {
      frames.push(frame);
      frame = this.#tryExtractFrame();
    }
    return frames;
  }

  /** Discards any buffered partial frame. */
  public reset(): void {
    this.#pending.clear();
  }

  #tryExtractFrame(): IDaemonFrame | undefined {
    if (this.#pending.byteLength < FRAME_HEADER_BYTES) {
      return undefined;
    }
    const payloadLength: number = this.#readPayloadLength();
    this.#assertPayloadLength(payloadLength);
    const frameBytes: number = FRAME_HEADER_BYTES + payloadLength;
    return this.#pending.byteLength < frameBytes ? undefined : this.#takeFrame(frameBytes, payloadLength);
  }
  #readPayloadLength(): number {
    const headerBytes: Uint8Array = this.#pending.readBytes(LENGTH_FIELD_OFFSET, FRAME_HEADER_BYTES);
    return new DataView(headerBytes.buffer).getUint32(LENGTH_FIELD_OFFSET, LITTLE_ENDIAN);
  }

  #assertPayloadLength(payloadLength: number): void {
    if (payloadLength > this.#maxPayloadBytes) {
      const message: string = `Frame payload of ${payloadLength} bytes exceeds the maximum of ${this.#maxPayloadBytes}.`;
      throw new DaemonProtocolError('frameTooLarge', message);
    }
  }

  #takeFrame(frameBytes: number, payloadLength: number): IDaemonFrame {
    const kindByte: number = this.#pending.readBytes(TYPE_FIELD_OFFSET, SINGLE_BYTE)[LENGTH_FIELD_OFFSET];
    this.#assertKnownKind(kindByte);
    const payload: Uint8Array = this.#pending.readBytes(FRAME_HEADER_BYTES, payloadLength);
    this.#pending.consume(frameBytes);
    return { kind: kindByte, payload };
  }

  #assertKnownKind(kindByte: number): void {
    if (!isDaemonFrameType(kindByte)) {
      throw new DaemonProtocolError(
        'unknownFrameType',
        `Frame declared an unknown frame kind byte 0x${kindByte.toString(HEX_RADIX)}.`
      );
    }
  }
}
