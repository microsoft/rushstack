// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { PosixModeBits } from '../PosixModeBits';

// The PosixModeBits are intended to be used with bitwise operations.
/* eslint-disable no-bitwise */

/**
 * Returns a 10-character string representation of a PosixModeBits value similar to what
 * would be displayed by a command such as "ls -l" on a POSIX-like operating system.
 * @remarks
 * For example, `PosixModeBits.AllRead | PosixModeBits.AllWrite` would be formatted as "-rw-rw-rw-".
 * @param modeBits - POSIX-style file mode bits specified using the {@link PosixModeBits} enum
 */
export function formatPosixModeBits(modeBits: PosixModeBits): string {
  let result: string = '-'; // (later we may add support for additional states such as S_IFDIR or S_ISUID)

  result += modeBits & PosixModeBits.UserRead ? 'r' : '-';
  result += modeBits & PosixModeBits.UserWrite ? 'w' : '-';
  result += modeBits & PosixModeBits.UserExecute ? 'x' : '-';

  result += modeBits & PosixModeBits.GroupRead ? 'r' : '-';
  result += modeBits & PosixModeBits.GroupWrite ? 'w' : '-';
  result += modeBits & PosixModeBits.GroupExecute ? 'x' : '-';

  result += modeBits & PosixModeBits.OthersRead ? 'r' : '-';
  result += modeBits & PosixModeBits.OthersWrite ? 'w' : '-';
  result += modeBits & PosixModeBits.OthersExecute ? 'x' : '-';

  return result;
}
