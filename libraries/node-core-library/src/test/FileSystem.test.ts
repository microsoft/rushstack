// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem, PosixModeBits } from '../FileSystem';

// The PosixModeBits are intended to be used with bitwise operations.
// tslint:disable:no-bitwise

test('PosixModeBits tests', () => {
  let mode: number = PosixModeBits.AllRead | PosixModeBits.AllWrite;

  expect(FileSystem.formatPosixModeBits(mode)).toEqual('-rw-rw-rw-');

  mode |= PosixModeBits.GroupExecute;
  expect(FileSystem.formatPosixModeBits(mode)).toEqual('-rw-rwxrw-');

  // Add the group execute bit
  mode |= PosixModeBits.OthersExecute;
  expect(FileSystem.formatPosixModeBits(mode)).toEqual('-rw-rwxrwx');

  // Add the group execute bit
  mode &= ~PosixModeBits.AllWrite;
  expect(FileSystem.formatPosixModeBits(mode)).toEqual('-r--r-xr-x');
});
