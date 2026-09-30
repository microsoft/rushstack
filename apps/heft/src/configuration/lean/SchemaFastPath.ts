// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';

import { tryParseJsonLean } from './LeanJson';
import { isDefinitelyValid } from './LeanJsonSchema';

/**
 * An optional native implementation of the schema fast path. Its contract is identical to
 * {@link tryValidateSchemaObject}: `true` only if the original ajv-based validation is guaranteed to accept the
 * schema and the data without logging anything. `undefined` means that it can't decide, and the JavaScript
 * implementation is used instead.
 */
export interface INativeSchemaValidator {
  validateObject(schemaObject: object, data: unknown): boolean | undefined;
  /**
   * Like `validateObject()`, for the schema that `JsonSchema.fromFile(schemaPath)` would load.
   */
  validateFile?(schemaPath: string, data: unknown): boolean | undefined;
}

let _nativeSchemaValidator: INativeSchemaValidator | undefined | false;

/**
 * The integration point for a native schema validator (see `src/native`). Returns `undefined` if no native
 * implementation is available, in which case the JavaScript implementation is used.
 */
function tryGetNativeSchemaValidator(): INativeSchemaValidator | undefined {
  if (_nativeSchemaValidator === undefined) {
    _nativeSchemaValidator = false;
  }

  return _nativeSchemaValidator || undefined;
}

/**
 * Returns `true` only if validating `data` against the schema with `JsonSchema` from
 * `@rushstack/node-core-library` is guaranteed to succeed without logging anything. Otherwise (including when the
 * data is invalid) returns `false`, and the caller must perform the original validation, which produces the
 * canonical errors.
 *
 * @param schemaObject - The parsed schema. The analysis of the schema is cached per object, so the object must not be
 * mutated.
 */
export function tryValidateSchemaObject(schemaObject: object, data: unknown): boolean {
  const nativeResult: boolean | undefined = tryGetNativeSchemaValidator()?.validateObject(schemaObject, data);
  if (nativeResult !== undefined) {
    return nativeResult;
  }

  return isDefinitelyValid(schemaObject, data);
}

// Parsed schema files, by path. `false` means that the file can't be parsed by the lean parser.
const _schemaObjectsByPath: Map<string, object | false> = new Map();

/**
 * Loads a schema file with the same result as `JsonFile.load()`, or returns `undefined` if that can't be
 * guaranteed. The result is cached per path.
 */
export function tryLoadSchemaFile(schemaPath: string): object | undefined {
  let schemaObject: object | false | undefined = _schemaObjectsByPath.get(schemaPath);
  if (schemaObject === undefined) {
    schemaObject = false;
    try {
      const parsed: { value: unknown } | undefined = tryParseJsonLean(fs.readFileSync(schemaPath, 'utf8'));
      if (parsed && typeof parsed.value === 'object' && parsed.value !== null) {
        schemaObject = parsed.value;
      }
    } catch {
      // Use the original implementation
    }

    _schemaObjectsByPath.set(schemaPath, schemaObject);
  }

  return schemaObject || undefined;
}

/**
 * Equivalent to {@link tryValidateSchemaObject} for the schema that `JsonSchema.fromFile(schemaPath)` would load.
 */
export function tryValidateSchemaFile(schemaPath: string, data: unknown): boolean {
  const nativeResult: boolean | undefined = tryGetNativeSchemaValidator()?.validateFile?.(schemaPath, data);
  if (nativeResult !== undefined) {
    return nativeResult;
  }

  const schemaObject: object | undefined = tryLoadSchemaFile(schemaPath);
  return schemaObject !== undefined && tryValidateSchemaObject(schemaObject, data);
}
