// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Returns a new string that is the input string with the order of characters reversed.
 * @public
 */
export function reverse(s: string): string {
  // Benchmarks of several algorithms: https://jsbench.me/4bkfflcm2z
  return s.split('').reduce((newString, char) => char + newString, '');
}
