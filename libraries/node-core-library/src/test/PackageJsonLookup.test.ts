// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/// <reference types="mocha" />
/* tslint:disable:no-function-expression - Mocha uses a poorly scoped "this" pointer */

import { assert } from 'chai';
import * as path from 'path';
import { PackageJsonLookup } from '../PackageJsonLookup';
import { IPackageJson } from '../IPackageJson';

describe('PackageJsonLookup', function (): void {

  describe('basic tests', function (): void {

    it('tryLoadPackageJsonFor() test', function (): void {
      const packageJsonLookup: PackageJsonLookup = new PackageJsonLookup();
      const sourceFilePath: string = path.join(__dirname, './test-data/example-package');
      const packageJson: IPackageJson | undefined = packageJsonLookup.tryLoadPackageJsonFor(sourceFilePath);
      assert.ok(packageJson);
      if (packageJson) {
        assert.equal(packageJson.name, 'example-package');
        assert.equal(packageJson.version, '1.0.0');

        // The "nonstandardField" should have been trimmed because loadExtraFields=false
        // tslint:disable-next-line:no-string-literal
        assert.notOk(packageJson['nonstandardField']);
      }
    });

    it('tryGetPackageFolderFor() test', function (): void {
      const packageJsonLookup: PackageJsonLookup = new PackageJsonLookup();
      const sourceFilePath: string = path.join(__dirname, './test-data/example-package/src/ExampleFile.txt');

      // Example: C:\web-build-tools\libraries\node-core-library\src\test\example-package
      const foundFolder: string | undefined = packageJsonLookup.tryGetPackageFolderFor(sourceFilePath);
      assert.isTrue(foundFolder && foundFolder.search(/[\\/]example-package$/i) >= 0,
        'Unexpected result: ' + foundFolder);

      const foundFile: string | undefined = packageJsonLookup.tryGetPackageJsonFilePathFor(sourceFilePath);

      assert.equal(foundFile, path.join(foundFolder || '', 'package.json'));
    });
  });
});
