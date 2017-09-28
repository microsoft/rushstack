// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/// <reference types="mocha" />
/* tslint:disable:no-function-expression - Mocha uses a poorly scoped "this" pointer */

import { assert } from 'chai';
import * as path from 'path';
import { PackageJsonLookup } from '../PackageJsonLookup';

describe('PackageJsonLookup', function (): void {

  describe('basic tests', function (): void {

    it('getPackageName() test', function (): void {
      const packageJsonLookup: PackageJsonLookup = new PackageJsonLookup();
      const sourceFilePath: string = path.join(__dirname, './test-data/example-package');
      assert.equal(packageJsonLookup.getPackageName(sourceFilePath), 'example-package');
    });

    it('tryGetPackageFolder() test', function (): void {
      const packageJsonLookup: PackageJsonLookup = new PackageJsonLookup();
      const sourceFilePath: string = path.join(__dirname, './test-data/example-package/src/ExampleFile.txt');

      // Example: C:\web-build-tools\libraries\node-core-library\src\test\example-package
      const foundPath: string | undefined = packageJsonLookup.tryGetPackageFolder(sourceFilePath);
      assert.isTrue(foundPath && foundPath.search(/[\\/]example-package$/i) >= 0, 'Unexpected result: ' + foundPath);
    });
  });
});
