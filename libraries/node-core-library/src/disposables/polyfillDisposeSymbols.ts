// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * @public
 * Polyfill for `Symbol.dispose` and `Symbol.asyncDispose` for Node.js versions prior to 20
 */
export function polyfillDisposeSymbols(): void {
  (Symbol as { dispose?: typeof Symbol.dispose }).dispose ??= Symbol.for(
    'Symbol.dispose'
  ) as typeof Symbol.dispose;
  (Symbol as { asyncDispose?: typeof Symbol.asyncDispose }).asyncDispose ??= Symbol.for(
    'Symbol.asyncDispose'
  ) as typeof Symbol.asyncDispose;
}
