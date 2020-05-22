// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';

import { FileSystem } from '../FileSystem';
import { PosixModeBits } from '../PosixModeBits';
import { FileSystemNotExistError } from '../FileSystemNotExistError';

// The PosixModeBits are intended to be used with bitwise operations.
/* eslint-disable no-bitwise */

test('PosixModeBits tests', () => {
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
});

test('Throws FileSystemNotExistError', () => {
  expect(() => FileSystem.getStatistics(path.join(__dirname, 'fileThatDoesntExist'))).toThrowError(FileSystemNotExistError);
});

test('Throws FileSystemNotExistError async', async () => {
  try {
    await FileSystem.getStatisticsAsync(path.join(__dirname, 'fileThatDoesntExist'));
  } catch (error) {
    if (!(error instanceof FileSystemNotExistError)) {
      fail();
    }
  }
});
