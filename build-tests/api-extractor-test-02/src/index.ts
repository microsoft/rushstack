// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Example documentation for the package.
 *
 * @remarks
 * Additional remarks
 *
 * @packagedocumentation
 */

export { SubclassWithImport } from './SubclassWithImport';

export * from './TypeFromImportedModule';

import { AmbientConsumer } from 'api-extractor-test-01';

// Test that the ambient types are accessible even though api-extractor-02 doesn't
// import Jest
const x = new AmbientConsumer();
const y = x.definitelyTyped();
const z = y.config;
