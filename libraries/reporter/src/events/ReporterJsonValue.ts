// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Represents JSON's `null`, which reporter event payloads may contain.
 *
 * @remarks
 * The Rush Stack lint rules discourage usage of `null`. However, JSON parsers
 * always return JavaScript's `null`. Reporter event payloads are transported as
 * JSON, so `ReporterJsonNull` is provided to describe that value without
 * triggering the lint rule. Do not use it for any other purpose.
 *
 * @beta
 */
// eslint-disable-next-line @rushstack/no-new-null
export type ReporterJsonNull = null;

/**
 * A JSON-serializable value.
 *
 * @remarks
 * Reporter events are immutable and JSON-serializable, and JavaScript `Error`
 * instances are never serialized directly. Typing an event payload as
 * `ReporterJsonValue` ensures that it can round-trip through
 * `JSON.stringify`/`JSON.parse` without loss and contains no functions, class
 * instances, or `undefined` values.
 *
 * @beta
 */
export type ReporterJsonValue =
  | string
  | number
  | boolean
  | ReporterJsonNull
  | readonly ReporterJsonValue[]
  | { readonly [key: string]: ReporterJsonValue };
