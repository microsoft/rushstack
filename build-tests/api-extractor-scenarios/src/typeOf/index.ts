// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Lib1Class } from 'api-extractor-lib1-test';

/**
 * Reference Lib1Class via "typeof"
 * @public
 */
export function f(): typeof Lib1Class | undefined {
  return undefined;
}

class ForgottenExport { }

/**
 * Reference IForgottenExport via "typeof"
 * @public
 */
export function g(): typeof ForgottenExport | undefined {
  return undefined;
}
