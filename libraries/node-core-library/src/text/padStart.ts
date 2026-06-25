// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Append characters to the start of a string to ensure the result has a minimum length.
 * @remarks
 * If the string length already exceeds the minimum length, then the string is unchanged.
 * The string is not truncated.
 * @public
 */
export function padStart(s: string, minimumLength: number, paddingCharacter: string = ' '): string {
  if (paddingCharacter.length !== 1) {
    throw new Error('The paddingCharacter parameter must be a single character.');
  }

  if (s.length < minimumLength) {
    const paddingArray: string[] = new Array(minimumLength - s.length);
    paddingArray.push(s);
    return paddingArray.join(paddingCharacter);
  } else {
    return s;
  }
}
