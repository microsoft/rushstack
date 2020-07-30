// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/** @public */
export interface IExample {
  dottedImportType: import('api-extractor-lib1-test').Lib1Namespace.Inner.X;
  dottedImportType2: import('api-extractor-lib1-test').Lib1Namespace.Y;
}
