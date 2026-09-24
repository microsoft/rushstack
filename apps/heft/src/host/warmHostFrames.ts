import * as fs from 'node:fs';

export const RUN_FRAME_TYPE: number = 0x01;
export const SIGNAL_FRAME_TYPE: number = 0x02;
export const ACCEPT_FRAME_TYPE: number = 0x10;
export const REFUSE_FRAME_TYPE: number = 0x11;
export const STANDARD_OUTPUT_FRAME_TYPE: number = 0x12;
export const STANDARD_ERROR_FRAME_TYPE: number = 0x13;
export const EXIT_FRAME_TYPE: number = 0x14;

const FRAME_HEADER_BYTES: number = 5;
const MAXIMUM_INCOMING_FRAME_PAYLOAD_BYTES: number = 16 * 1024 * 1024;
const WAIT_FOR_WRITABLE_SOCKET_MILLISECONDS: number = 1;

export interface IWarmHostFrame {
  readonly frameType: number;
  readonly payload: Buffer;
}

export class WarmHostFrameReader {
  #pendingBytes: Buffer = Buffer.alloc(0);

  public pushBytes(incomingBytes: Buffer): IWarmHostFrame[] {
    this.#pendingBytes =
      this.#pendingBytes.length === 0 ? incomingBytes : Buffer.concat([this.#pendingBytes, incomingBytes]);
    const completeFrames: IWarmHostFrame[] = [];
    while (this.#pendingBytes.length >= FRAME_HEADER_BYTES) {
      const payloadLength: number = this.#pendingBytes.readUInt32LE(0);
      if (payloadLength > MAXIMUM_INCOMING_FRAME_PAYLOAD_BYTES) {
        throw new Error(`A warm host frame of ${payloadLength} bytes exceeds the limit.`);
      }
      const frameLength: number = FRAME_HEADER_BYTES + payloadLength;
      if (this.#pendingBytes.length < frameLength) {
        break;
      }
      completeFrames.push({
        frameType: this.#pendingBytes[4],
        payload: Buffer.from(this.#pendingBytes.subarray(FRAME_HEADER_BYTES, frameLength))
      });
      this.#pendingBytes = this.#pendingBytes.subarray(frameLength);
    }
    return completeFrames;
  }
}

function sleepSynchronously(milliseconds: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function writeAllBytesSynchronously(socketFileDescriptor: number, bytes: Uint8Array): void {
  let writtenByteCount: number = 0;
  while (writtenByteCount < bytes.length) {
    try {
      writtenByteCount += fs.writeSync(socketFileDescriptor, bytes, writtenByteCount);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EAGAIN') {
        throw error;
      }
      sleepSynchronously(WAIT_FOR_WRITABLE_SOCKET_MILLISECONDS);
    }
  }
}

export function writeFrameSynchronously(
  socketFileDescriptor: number,
  frameType: number,
  payload: Uint8Array
): void {
  const frameHeader: Buffer = Buffer.alloc(FRAME_HEADER_BYTES);
  frameHeader.writeUInt32LE(payload.length, 0);
  frameHeader[4] = frameType;
  writeAllBytesSynchronously(socketFileDescriptor, frameHeader);
  writeAllBytesSynchronously(socketFileDescriptor, payload);
}

export function createExitFramePayload(exitCode: number): Buffer {
  const exitFramePayload: Buffer = Buffer.alloc(4);
  exitFramePayload.writeInt32LE(exitCode, 0);
  return exitFramePayload;
}
