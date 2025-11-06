// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

const NEWLINE_REGEX: RegExp = /\r\n|\n\r|\r|\n/g;

/**
 * Converts all newlines in the provided string to use POSIX-style LF end of line characters.
 *
 * POSIX is a registered trademark of the Institute of Electrical and Electronic Engineers, Inc.
 * @public
 */
export function convertToLf(input: string): string {
  return input.replace(NEWLINE_REGEX, '\n');
}
