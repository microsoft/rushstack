// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/// <reference path="../typings/tsd.d.ts" />
/// <reference types="long" preserve="true" />

/**
 * api-extractor-test-02
 *
 * @remarks
 * This library consumes api-extractor-test-01 and is consumed by api-extractor-test-03.
 *
 * @packageDocumentation
 */
export { SubclassWithImport } from './SubclassWithImport';

export type * from './TypeFromImportedModule';

export { importDeduping1 } from './ImportDeduping1';
export { importDeduping2 } from './ImportDeduping2';
export { ReexportedClass as RenamedReexportedClass3 } from 'api-extractor-test-01';

export * from './Ambient';
