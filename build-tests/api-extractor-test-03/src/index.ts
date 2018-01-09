// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { SubclassWithImport } from 'api-extractor-test-02';

const subclassWithImport: SubclassWithImport = new SubclassWithImport();

subclassWithImport.test();
console.log(subclassWithImport.getSelfReference().getValue());
