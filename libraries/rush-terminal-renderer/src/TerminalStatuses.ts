// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * The raw engine operation status strings that end an operation's stream.
 *
 * @beta
 */
export const TERMINAL_OPERATION_STATUSES: ReadonlySet<string> = new Set([
  'SUCCESS',
  'SUCCESS WITH WARNINGS',
  'SKIPPED',
  'FROM CACHE',
  'FAILURE',
  'BLOCKED',
  'NO OP',
  'ABORTED'
]);

const NO_COLOR_LEVEL: number = 0;

/**
 * Whether the collated pipeline should strip ANSI colors for a client with
 * the given color level (absent or `0` means strip).
 *
 * @beta
 */
export function shouldRemoveColors(colorLevel: number | undefined): boolean {
  return colorLevel === undefined || colorLevel === NO_COLOR_LEVEL;
}
