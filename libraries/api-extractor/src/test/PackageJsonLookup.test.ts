// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/// <reference types="mocha" />
/* tslint:disable:no-function-expression - Mocha uses a poorly scoped "this" pointer */

import { assert } from 'chai';
import * as path from 'path';
import PackageJsonLookup from '../PackageJsonLookup';

describe('PackageJsonLookup', function (): void {

  describe('basic tests', function (): void {

    it('readPackageName() test', function (): void {
      const packageJsonLookup: PackageJsonLookup = new PackageJsonLookup();
      const sourceFilePath: string = path.join(__dirname, '../../testInputs/example1');
      assert.equal(packageJsonLookup.readPackageName(sourceFilePath), 'example1');
    });

    it('tryFindPackagePathUpwards() test', function (): void {
      const packageJsonLookup: PackageJsonLookup = new PackageJsonLookup();
      const sourceFilePath: string = path.join(__dirname, '../../testInputs/example1/folder/AliasClass.ts');

      // Example: C:\web-build-tools\libraries\api-extractor\testInputs\example1
      const foundPath: string = packageJsonLookup.tryFindPackagePathUpwards(sourceFilePath);
      assert.isTrue(foundPath.search(/[\\/]example1$/i) >= 0, 'Unexpected result: ' + foundPath);
    });
  });
});
