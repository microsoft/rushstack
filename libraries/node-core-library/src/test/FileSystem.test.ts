// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem } from '../FileSystem';
import { PosixModeBits } from '../PosixModeBits';

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
