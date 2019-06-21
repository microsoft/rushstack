// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/// <reference path="../typings/tsd.d.ts" />

/**
 * api-extractor-test-03
 *
 * Test scenarios for consuming a library (api-extractor-test-02) that consumes
 * an indirect dependency (api-extractor-test-01).
 */

import { SubclassWithImport, RenamedReexportedClass3 } from 'api-extractor-test-02';

const subclassWithImport: SubclassWithImport = new SubclassWithImport();

subclassWithImport.test();
console.log(subclassWithImport.getSelfReference().getValue());
