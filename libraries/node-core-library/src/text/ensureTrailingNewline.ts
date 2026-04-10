// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { NewlineKind } from './getNewline';

const NEWLINE_AT_END_REGEX: RegExp = /(\r\n|\n\r|\r|\n)$/;

/**
 * Returns the input string with a trailing `\n` character appended, if not already present.
 * @public
 */
export function ensureTrailingNewline(s: string, newlineKind: NewlineKind = NewlineKind.Lf): string {
  // Is there already a newline?
  if (NEWLINE_AT_END_REGEX.test(s)) {
    return s; // yes, no change
  }
  return s + newlineKind; // no, add it
}
