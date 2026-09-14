// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as fs from 'node:fs';

import { writeAllSync, WriteAllSyncError } from '../utilities/writeAllSync';

describe(writeAllSync.name, () => {
  it('retries byte offsets rather than splitting UTF-8 strings', () => {
    const fsModule: typeof fs = jest.requireActual('node:fs');
    const chunks: Buffer[] = [];
    const writeSpy = jest.spyOn(fsModule, 'writeSync').mockImplementation(
      (
        fd: number,
        buffer: string | NodeJS.ArrayBufferView,
        offset?: number | null,
        length?: number | BufferEncoding | null
      ): number => {
        expect(fd).toBe(123);
        if (typeof buffer === 'string' || typeof offset !== 'number' || typeof length !== 'number') {
          throw new Error('Expected a byte-oriented write.');
        }
        const count: number = Math.min(2, length);
        chunks.push(Buffer.from(buffer.buffer, buffer.byteOffset + offset, count));
        return count;
      }
    );
    try {
      writeAllSync(123, 'A\u{1f680}\u4e2dB');
      expect(Buffer.concat(chunks).toString('utf8')).toBe('A\u{1f680}\u4e2dB');
      expect(writeSpy).toHaveBeenCalledTimes(5);
    } finally {
      writeSpy.mockRestore();
    }
  });

  it.each([0, -1, Number.NaN, 100])('rejects invalid progress %s with the persisted offset', (written) => {
    const fsModule: typeof fs = jest.requireActual('node:fs');
    const writeSpy = jest.spyOn(fsModule, 'writeSync').mockReturnValueOnce(2).mockReturnValueOnce(written);
    try {
      expect(() => writeAllSync(123, 'abcdef')).toThrow(WriteAllSyncError);
      expect(writeSpy).toHaveBeenCalledTimes(2);
    } finally {
      writeSpy.mockRestore();
    }
  });

  it('preserves an I/O failure and the number of bytes already persisted', () => {
    const fsModule: typeof fs = jest.requireActual('node:fs');
    const failure: Error = new Error('disk full');
    const writeSpy = jest
      .spyOn(fsModule, 'writeSync')
      .mockReturnValueOnce(2)
      .mockImplementationOnce(() => {
        throw failure;
      });
    try {
      try {
        writeAllSync(123, 'abcdef');
        throw new Error('Expected the I/O failure.');
      } catch (error) {
        expect(error).toBeInstanceOf(WriteAllSyncError);
        if (!(error instanceof WriteAllSyncError)) {
          throw error;
        }
        expect(error.bytesWritten).toBe(2);
        expect(error.cause).toBe(failure);
      }
    } finally {
      writeSpy.mockRestore();
    }
  });
});
