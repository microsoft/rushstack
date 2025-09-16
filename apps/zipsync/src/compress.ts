// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { Transform } from 'node:stream';
import zlib from 'node:zlib';
import { DISPOSE_SYMBOL } from './disposableFileHandle';

type OutputChunkHandler = (chunk: Uint8Array, lengthBytes: number) => void;

const kError: unique symbol = (() => {
  // Create an instance of Deflate so that we can get our hands on the internal error symbol
  // It isn't exported.
  const reference: zlib.Deflate = zlib.createDeflateRaw();
  const kErrorResult: symbol | undefined = Object.getOwnPropertySymbols(reference).find((x) =>
    x.toString().includes('kError')
  );
  if (kErrorResult === undefined) {
    throw new Error('Unable to find the internal error symbol in node:zlib');
  }
  reference.close();
  return kErrorResult;
  // Casting `symbol` to the exact symbol of this definition
})() as typeof kError;

/**
 * Internal members of all Zlib compressors.
 * Needed to
 */
interface IZlibInternals {
  /**
   * The native binding to Zlib.
   */
  _handle: IHandle | undefined;
  /**
   * The flush flag passed to each call other than the last one for this implementation.
   * Varies by compressor.
   */
  _defaultFlushFlag: number;
  /**
   * The flush flag passed to the final call for this implementation.
   * Varies by compressor.
   */
  _finishFlushFlag: number;
  /**
   * The number of bytes read from the input and written to the output.
   */
  _writeState: [number, number];
  /**
   * The internal error state
   */
  [kError]: Error | undefined;
}

type Compressor = Transform & IZlibInternals;

interface IHandle {
  /**
   * Closes the handle and releases resources.
   * Ensure that this is always invoked.
   */
  close(): void;
  /**
   * Compresses up to `inLen` bytes from `chunk` starting at `inOff`.
   * Writes up to `outLen` bytes to `output` starting at `outOff`.
   * @param flushFlag - The flush flag to the compressor implementation. Defines the behavior when reaching the end of the input.
   * @param chunk - The buffer containing the data to be compressed
   * @param inOff - The offset in bytes to start reading from `chunk`
   * @param inLen - The maximum number of bytes to read from `chunk`
   * @param output - The buffer to write the compressed data to
   * @param outOff - The offset in bytes to start writing to `output` at
   * @param outLen - The maximum number of bytes to write to `output`.
   */
  writeSync(
    flushFlag: number,
    chunk: Uint8Array,
    inOff: number,
    inLen: number,
    output: Uint8Array,
    outOff: number,
    outLen: number
  ): void;
}

export type IIncrementalZlib = Disposable & {
  update: (inputBuffer: Uint8Array) => void;
};

export function createIncrementalZlib(
  outputBuffer: Uint8Array,
  handleOutputChunk: OutputChunkHandler,
  mode: 'deflate' | 'inflate'
): IIncrementalZlib {
  // The zlib constructors all allocate a buffer of size chunkSize using Buffer.allocUnsafe
  // We want to ensure that that invocation doesn't allocate a buffer.
  // Unfortunately the minimum value of `chunkSize` to the constructor is non-zero

  let compressor: Compressor | undefined;

  const savedAllocUnsafe: typeof Buffer.allocUnsafe = Buffer.allocUnsafe;

  try {
    //@ts-expect-error
    Buffer.allocUnsafe = () => outputBuffer;
    if (mode === 'inflate') {
      compressor = zlib.createInflateRaw({
        chunkSize: outputBuffer.byteLength
      }) as unknown as Transform & IZlibInternals;
    } else {
      compressor = zlib.createDeflateRaw({
        chunkSize: outputBuffer.byteLength,
        level: zlib.constants.Z_BEST_COMPRESSION
      }) as unknown as Transform & IZlibInternals;
    }
  } finally {
    Buffer.allocUnsafe = savedAllocUnsafe;
  }

  if (!compressor) {
    throw new Error('Failed to create zlib instance');
  }

  const handle: IHandle = compressor._handle!;

  return {
    [DISPOSE_SYMBOL]: () => {
      if (compressor._handle) {
        compressor._handle.close();
        compressor._handle = undefined;
      }
    },
    update: function processInputChunk(inputBuffer: Uint8Array): void {
      let error: Error | undefined;

      // Directive to the compressor on reaching the end of the current input buffer
      // Default value is to expect more data
      let flushFlag: number = compressor._defaultFlushFlag;

      let bytesInInputBuffer: number = inputBuffer.byteLength;

      if (bytesInInputBuffer <= 0) {
        // Ensure the value is non-negative
        // We will call the compressor one last time with 0 bytes of input
        bytesInInputBuffer = 0;
        // Tell the compressor to flush anything in its internal buffer and write any needed trailer.
        flushFlag = compressor._finishFlushFlag;
      }

      let availInBefore: number = bytesInInputBuffer;
      let inOff: number = 0;
      let availOutAfter: number = 0;
      let availInAfter: number | undefined;

      const state: [number, number] = compressor._writeState;

      do {
        handle.writeSync(
          flushFlag,
          inputBuffer, // in
          inOff, // in_off
          availInBefore, // in_len
          outputBuffer, // out
          0, // out_off
          outputBuffer.byteLength // out_len
        );

        if (error) {
          throw error;
        } else if (compressor[kError]) {
          throw compressor[kError];
        }

        availOutAfter = state[0];
        availInAfter = state[1];

        const inDelta: number = availInBefore - availInAfter;

        const have: number = outputBuffer.byteLength - availOutAfter;
        if (have > 0) {
          handleOutputChunk(outputBuffer, have);
        }

        // These values get reset if we have new data,
        // so we can update them even if we're done
        inOff += inDelta;
        availInBefore = availInAfter;
      } while (availOutAfter === 0);
    }
  };
}
