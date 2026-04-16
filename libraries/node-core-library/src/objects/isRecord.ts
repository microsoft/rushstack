// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Returns `true` if `value` is a non-null, non-array plain object (i.e. assignable to
 * `Record<string, unknown>`), narrowing the type accordingly.
 *
 * @public
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
