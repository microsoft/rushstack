// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * A function that references its own parameter type.
 * @public
 */
export function f1(x: number): typeof x {
  return x;
}

/**
 * A function that indirectly references its own parameter type.
 * @public
 */
export function f2(x: number): keyof typeof x {
  return 'valueOf';
}

/**
 * A function that references its own type.
 * @public
 */
export function f3(): typeof f3 | undefined {
  return undefined;
}
