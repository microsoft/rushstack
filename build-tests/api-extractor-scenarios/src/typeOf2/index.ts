// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/** @public */
export function f(): { a: number } {
  return { a: 1 };
}

/** @public */
export function g(callback: typeof f): typeof f {
  return callback;
}
