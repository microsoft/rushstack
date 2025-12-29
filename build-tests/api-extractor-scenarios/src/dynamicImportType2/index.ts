// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.
import { Lib1Namespace } from 'api-extractor-lib1-test';

/** @public */
export interface IExample {
  predefinedNamedImport: Lib1Namespace.Inner.X;
  dottedImportType: import('api-extractor-lib1-test').Lib1Namespace.Inner.X | undefined;
  dottedImportType2: import('api-extractor-lib1-test').Lib1Namespace.Y | undefined;
  localDottedImportType: import('./namespace-export').LocalModule.LocalClass;
  localDottedImportType2: import('./namespace-export').LocalNS.LocalNSClass;
}
