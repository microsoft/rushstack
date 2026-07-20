// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Regular expression to match all types of newline characters
 * @internal
 */
export const NEWLINE_REGEX: RegExp = /\r\n|\n\r|\r|\n/g;

/**
 * Helper function to replace all newlines in a string with a specified replacement
 * @internal
 */
export function replaceNewlines(input: string, replacement: string): string {
  return input.replace(NEWLINE_REGEX, replacement);
}
