// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * @module
 * Functions for manipulating text.
 */

/**
 * Convert line endings to `\n`
 * @public
 */
export function convertToLf(input: string): string {
  return input.replace(/\r\n/g, '\n');
}

/**
 * Convert line endings to `\r\n`
 * @public
 */
export function convertToCrLf(input: string): string {
  return input.replace(/\r?\n/g, '\r\n');
}
