// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/** @public */
export class Item {
  options: import('./Options').Options;
  lib1: import('api-extractor-lib1-test').Lib1Interface;
  lib2: import('api-extractor-lib2-test').Lib2Interface;
  lib3: import('api-extractor-lib3-test').Lib1Class;
  defaultImport: import('api-extractor-lib2-test').default;
  externalModule: typeof import('api-extractor-lib3-test');
  localModule: typeof import('./Options');
  typeofImportLocal: typeof import('./Options').OptionsClass;
  typeofImportExternal: typeof import('api-extractor-lib3-test').Lib1Class;
  reExportLocal: import('./re-export').Lib2Class;
  reExportExternal: import('./re-export').Lib3Class;
}
