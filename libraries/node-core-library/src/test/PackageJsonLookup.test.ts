// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { PackageJsonLookup } from '../PackageJsonLookup';
import { IPackageJson } from '../IPackageJson';
import { FileConstants } from '../Constants';

describe('PackageJsonLookup', () => {

  describe('basic tests', () => {

    test('', () => {
      expect(PackageJsonLookup.loadOwnPackageJson(__dirname, '../..').name).toEqual('@microsoft/node-core-library');
    });

    test('tryLoadPackageJsonFor() test', () => {
      const packageJsonLookup: PackageJsonLookup = new PackageJsonLookup();
      const sourceFilePath: string = path.join(__dirname, './test-data/example-package');
      const packageJson: IPackageJson | undefined = packageJsonLookup.tryLoadPackageJsonFor(sourceFilePath);
      expect(packageJson).toBeDefined();
      if (packageJson) {
        expect(packageJson.name).toEqual('example-package');
        expect(packageJson.version).toEqual('1.0.0');

        // The "nonstandardField" should have been trimmed because loadExtraFields=false
        expect(packageJson).not.toHaveProperty('nonstandardField');
      }
    });

    test('tryGetPackageFolderFor() test', () => {
      const packageJsonLookup: PackageJsonLookup = new PackageJsonLookup();
      const sourceFilePath: string = path.join(__dirname, './test-data/example-package/src/ExampleFile.txt');

      // Example: C:\web-build-tools\libraries\node-core-library\src\test\example-package
      const foundFolder: string | undefined = packageJsonLookup.tryGetPackageFolderFor(sourceFilePath);
      expect(foundFolder).toBeDefined();
      expect(foundFolder!.search(/[\\/]example-package$/i)).toBeGreaterThan(0);

      const foundFile: string | undefined = packageJsonLookup.tryGetPackageJsonFilePathFor(sourceFilePath);

      expect(foundFile).toEqual(path.join(foundFolder || '', FileConstants.PackageJson));
    });
  });
});
