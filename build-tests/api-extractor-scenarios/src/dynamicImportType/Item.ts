// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/** @public */
export class Item {
  options: import('./Options.ts').Options;
  lib1: import('api-extractor-lib1-test').Lib1Interface;
  lib2: import('api-extractor-lib2-test').Lib2Interface;
  lib3: import('api-extractor-lib3-test').Lib1Class;
  reExport: import('./re-export.ts').Lib2Class;
}
