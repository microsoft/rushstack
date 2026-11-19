// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// TODO(reconcile): replace with `ReporterJsonNull`/`ReporterJsonValue` from
// `@rushstack/reporter` once that package merges into main (#5858).

/**
 * Represents JSON's `null`, which daemon event payloads may contain.
 *
 * @remarks
 * JSON parsers always return JavaScript's `null`. Event payloads are transported
 * as JSON, so this alias describes that value without triggering the repo's
 * no-new-null lint rule. Do not use it for any other purpose.
 *
 * @beta
 */
export type DaemonJsonNull = null;

/**
 * A JSON-serializable value.
 *
 * @remarks
 * Event payloads are immutable and JSON-serializable, and JavaScript `Error`
 * instances are never serialized directly. Typing a payload as
 * `DaemonJsonValue` ensures it round-trips through `JSON.stringify`/`JSON.parse`
 * without loss.
 *
 * @beta
 */
export type DaemonJsonValue =
  | string
  | number
  | boolean
  | DaemonJsonNull
  | readonly DaemonJsonValue[]
  | { readonly [key: string]: DaemonJsonValue };
