// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { createGunzip, type Gunzip } from 'zlib';

export interface IDecompressResult {
  buffers: Buffer[];
  totalBytes: number;
}

const reference: Gunzip = createGunzip();
const kError: symbol = Object.getOwnPropertySymbols(reference).find((x) => x.toString().includes('kError'))!;
reference.close();

interface IHandle {
  close(): void;
  writeSync(
    flag: number,
    chunk: Buffer,
    inOff: number,
    inLen: number,
    output: Buffer,
    outOff: number,
    outLen: number
  ): void;
}

interface IZlibInternals {
  _chunkSize: number;
  _handle: IHandle | undefined;
  _finishFlushFlag: number;
  _maxOutputLength: number;
  _outBuffer: Buffer;
  _outOffset: number;
  _writeState: [number, number];
  bytesWritten: number;
  [err: symbol]: Error | undefined;
}

/**
 * Forked from NodeJS's internal `zlib` package, this code is `gunzipSync()` without calling `Buffer.concat`.
 * The change here is to save the step of copying the buffer when it is about to get copied to a SharedArrayBuffer.
 * This really only saves a few milliseconds per package, but it's a cheap gain.
 */
export function gunzipSync(chunk: Buffer): IDecompressResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const self: Gunzip & IZlibInternals = createGunzip() as unknown as Gunzip & IZlibInternals;

  let availInBefore: number = chunk.byteLength;
  let availOutBefore: number = self._chunkSize - self._outOffset;
  let inOff: number = 0;
  let availOutAfter: number = 0;
  let availInAfter: number | undefined;

  const buffers: Buffer[] = [];
  let nread: number = 0;
  let inputRead: number = 0;
  const state: [number, number] = self._writeState;
  const handle: IHandle = self._handle!;
  let buffer: Buffer = self._outBuffer;
  let offset: number = self._outOffset;
  const chunkSize: number = self._chunkSize;
  const flushFlag: number = self._finishFlushFlag;

  let error: Error | undefined;
  self.on('error', function onError(er: Error) {
    error = er;
  });

  while (availOutAfter === 0) {
    handle.writeSync(
      flushFlag,
      chunk, // in
      inOff, // in_off
      availInBefore, // in_len
      buffer, // out
      offset, // out_off
      availOutBefore
    ); // out_len

    if (error) {
      throw error;
    } else if (self[kError]) {
      throw self[kError];
    }

    availOutAfter = state[0];
    availInAfter = state[1];

    const inDelta: number = availInBefore - availInAfter;
    inputRead += inDelta;

    const have: number = availOutBefore - availOutAfter;
    if (have > 0) {
      const out: Buffer = buffer.slice(offset, offset + have);
      offset += have;
      buffers.push(out);
      nread += out.byteLength;

      if (nread > self._maxOutputLength) {
        _close(self);
        throw new Error(`Buffer too large: ${self._maxOutputLength}`);
      }
    }

    // Exhausted the output buffer, or used all the input create a new one.
    if (availOutAfter === 0 || offset >= chunkSize) {
      availOutBefore = chunkSize;
      offset = 0;
      buffer = Buffer.allocUnsafe(chunkSize);
    }

    if (availOutAfter === 0) {
      // Not actually done. Need to reprocess.
      // Also, update the availInBefore to the availInAfter value,
      // so that if we have to hit it a third (fourth, etc.) time,
      // it'll have the correct byte counts.
      inOff += inDelta;
      availInBefore = availInAfter;
    }
  }

  self.bytesWritten = inputRead;
  _close(self);

  return {
    buffers,
    totalBytes: nread
  };
}

function _close(unzip: { _handle: IHandle | undefined }): void {
  if (unzip._handle) {
    unzip._handle.close();
    unzip._handle = undefined;
  }
}
