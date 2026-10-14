// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as equalModule from 'ajv/dist/runtime/equal';
import * as parseJsonModule from 'ajv/dist/runtime/parseJson';
import * as quoteModule from 'ajv/dist/runtime/quote';
import * as timestampModule from 'ajv/dist/runtime/timestamp';
import * as ucs2lengthModule from 'ajv/dist/runtime/ucs2length';
import * as uriModule from 'ajv/dist/runtime/uri';
import * as validationErrorModule from 'ajv/dist/runtime/validation_error';
import * as formatsModule from 'ajv-formats/dist/formats';
import * as limitModule from 'ajv-formats/dist/limit';

// Node's ESM import of a CommonJS module wraps its exports under `default`.
// Normalize that wrapper so generated standalone code sees the same shape as require().
function _asCommonJsExports<T>(imported: T): T {
  const defaultExport: unknown = (imported as unknown as { default?: unknown }).default;
  return defaultExport &&
    typeof defaultExport === 'object' &&
    '__esModule' in defaultExport &&
    defaultExport.__esModule === true
    ? (defaultExport as T)
    : imported;
}

export const equal: typeof equalModule = _asCommonJsExports(equalModule);
export const parseJson: typeof parseJsonModule = _asCommonJsExports(parseJsonModule);
export const quote: typeof quoteModule = _asCommonJsExports(quoteModule);
export const timestamp: typeof timestampModule = _asCommonJsExports(timestampModule);
export const ucs2length: typeof ucs2lengthModule = _asCommonJsExports(ucs2lengthModule);
export const uri: typeof uriModule = _asCommonJsExports(uriModule);
export const validationError: typeof validationErrorModule = _asCommonJsExports(validationErrorModule);
export const formats: typeof formatsModule = _asCommonJsExports(formatsModule);
export const limit: typeof limitModule = _asCommonJsExports(limitModule);
