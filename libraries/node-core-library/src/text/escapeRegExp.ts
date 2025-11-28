// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Escapes a string so that it can be treated as a literal string when used in a regular expression.
 * @public
 */
export function escapeRegExp(literal: string): string {
  return literal.replace(/[^A-Za-z0-9_]/g, '\\$&');
}
