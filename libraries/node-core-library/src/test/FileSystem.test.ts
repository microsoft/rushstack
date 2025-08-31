// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import fs from 'node:fs';

import { FileSystem } from '../FileSystem';
import { PosixModeBits } from '../PosixModeBits';

describe(FileSystem.name, () => {
  test(FileSystem.formatPosixModeBits.name, () => {
    // The PosixModeBits are intended to be used with bitwise operations.
    /* eslint-disable no-bitwise */
    let modeBits: number = PosixModeBits.AllRead | PosixModeBits.AllWrite;

    expect(FileSystem.formatPosixModeBits(modeBits)).toEqual('-rw-rw-rw-');

    modeBits |= PosixModeBits.GroupExecute;
    expect(FileSystem.formatPosixModeBits(modeBits)).toEqual('-rw-rwxrw-');

    // Add the group execute bit
    modeBits |= PosixModeBits.OthersExecute;
    expect(FileSystem.formatPosixModeBits(modeBits)).toEqual('-rw-rwxrwx');

    // Add the group execute bit
    modeBits &= ~PosixModeBits.AllWrite;
    expect(FileSystem.formatPosixModeBits(modeBits)).toEqual('-r--r-xr-x');
    /* eslint-enable no-bitwise */
  });

  describe(FileSystem.isErrnoException.name, () => {
    test('Should return false for a non-ErrnoException', () => {
      const error: Error = new Error('Test error');
      expect(FileSystem.isErrnoException(error)).toBe(false);
    });

    test('Should return true for an error on a path call', () => {
      expect.assertions(1);
      try {
        fs.openSync(`${__dirname}/nonexistent.txt`, 'r');
      } catch (error) {
        expect(FileSystem.isErrnoException(error)).toBe(true);
      }
    });

    test('Should return true for an error on a file descriptor call', () => {
      expect.assertions(1);
      try {
        fs.readFileSync(`${__dirname}/nonexistent.txt`);
      } catch (error) {
        expect(FileSystem.isErrnoException(error)).toBe(true);
      }
    });
  });
});
