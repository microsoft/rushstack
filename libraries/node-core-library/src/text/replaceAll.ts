// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Returns the same thing as targetString.replace(searchValue, replaceValue), except that
 * all matches are replaced, rather than just the first match.
 * @param input         - The string to be modified
 * @param searchValue   - The value to search for
 * @param replaceValue  - The replacement text
 * @public
 */
export function replaceAll(input: string, searchValue: string, replaceValue: string): string {
  return input.split(searchValue).join(replaceValue);
}
