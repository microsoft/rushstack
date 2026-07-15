// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// eslint-disable-next-line no-control-regex
const ANSI_ESCAPE_REGEXP: RegExp = /\u001b\[[0-9;]*[A-Za-z]/g;

/**
 * Removes ANSI escape sequences from text for problem matching.
 *
 * @remarks
 * Normalization is applied only to the copy that matchers process; the raw
 * output is preserved unchanged.
 *
 * @param text - the raw text
 *
 * @beta
 */
export function normalizeAnsi(text: string): string {
  return text.replace(ANSI_ESCAPE_REGEXP, '');
}
