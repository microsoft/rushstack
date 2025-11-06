// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

const NEWLINE_REGEX: RegExp = /\r\n|\n\r|\r|\n/g;

/**
 * Converts all newlines in the provided string to use Windows-style CRLF end of line characters.
 * @public
 */
export function convertToCrLf(input: string): string {
  return input.replace(NEWLINE_REGEX, '\r\n');
}
