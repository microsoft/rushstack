// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Splits the provided string by newlines. Note that leading and trailing newlines will produce
 * leading or trailing empty string array entries.
 * @public
 */
export function splitByNewLines(s: undefined): undefined;
/**
 * Splits the provided string by newlines. Note that leading and trailing newlines will produce
 * leading or trailing empty string array entries.
 * @public
 */
export function splitByNewLines(s: string): string[];
/**
 * Splits the provided string by newlines. Note that leading and trailing newlines will produce
 * leading or trailing empty string array entries.
 * @public
 */
export function splitByNewLines(s: string | undefined): string[] | undefined;
export function splitByNewLines(s: string | undefined): string[] | undefined {
  return s?.split(/\r?\n/);
}
