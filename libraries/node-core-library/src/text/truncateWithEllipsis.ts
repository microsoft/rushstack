// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * If the string is longer than maximumLength characters, truncate it to that length
 * using "..." to indicate the truncation.
 *
 * @remarks
 * For example truncateWithEllipsis('1234578', 5) would produce '12...'.
 * @public
 */
export function truncateWithEllipsis(s: string, maximumLength: number): string {
  if (maximumLength < 0) {
    throw new Error('The maximumLength cannot be a negative number');
  }

  if (s.length <= maximumLength) {
    return s;
  }

  if (s.length <= 3) {
    return s.substring(0, maximumLength);
  }

  return s.substring(0, maximumLength - 3) + '...';
}
