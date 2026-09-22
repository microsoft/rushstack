// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/** Returns `true` when `value` is a non-null control record. @beta */
export function isDaemonControlRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
