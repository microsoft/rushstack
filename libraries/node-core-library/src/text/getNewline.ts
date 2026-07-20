// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'node:os';

/**
 * Enumeration controlling conversion of newline characters.
 * @public
 */
export enum NewlineKind {
  /**
   * Windows-style newlines
   */
  CrLf = '\r\n',

  /**
   * POSIX-style newlines
   *
   * @remarks
   * POSIX is a registered trademark of the Institute of Electrical and Electronic Engineers, Inc.
   */
  Lf = '\n',

  /**
   * Default newline type for this operating system (`os.EOL`).
   */
  OsDefault = 'os'
}

/**
 * Returns the newline character sequence for the specified `NewlineKind`.
 * @public
 */
export function getNewline(newlineKind: NewlineKind): string {
  switch (newlineKind) {
    case NewlineKind.CrLf:
      return '\r\n';
    case NewlineKind.Lf:
      return '\n';
    case NewlineKind.OsDefault:
      return os.EOL;
    default:
      throw new Error('Unsupported newline kind');
  }
}
