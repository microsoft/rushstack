// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import { PackageJsonLookup } from '../PackageJsonLookup';
import type { IPackageJson, INodePackageJson } from '../IPackageJson';
import { FileConstants } from '../Constants';

describe(PackageJsonLookup.name, () => {
  describe('basic tests', () => {
    test(PackageJsonLookup.loadOwnPackageJson.name, () => {
      expect(PackageJsonLookup.loadOwnPackageJson(__dirname).name).toEqual('@rushstack/node-core-library');
    });

    test(PackageJsonLookup.prototype.tryLoadPackageJsonFor.name, () => {
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

    test(`${PackageJsonLookup.prototype.tryLoadNodePackageJsonFor.name} test package with no version`, () => {
      const packageJsonLookup: PackageJsonLookup = new PackageJsonLookup();
      const sourceFilePath: string = path.join(__dirname, './test-data/example-package-no-version');
      const packageJson: INodePackageJson | undefined =
        packageJsonLookup.tryLoadNodePackageJsonFor(sourceFilePath);
      expect(packageJson).toBeDefined();
      if (packageJson) {
        expect(packageJson.name).toEqual('example-package');
        expect(packageJson.version).not.toBeDefined();

        // The "nonstandardField" should have been trimmed because loadExtraFields=false
        expect(packageJson).not.toHaveProperty('nonstandardField');
      }
    });

    test(PackageJsonLookup.prototype.tryGetPackageFolderFor.name, () => {
      const packageJsonLookup: PackageJsonLookup = new PackageJsonLookup();
      const sourceFilePath: string = path.join(__dirname, './test-data/example-package/src/ExampleFile.txt');

      // Example: C:\rushstack\libraries\node-core-library\src\test\example-package
      const foundFolder: string | undefined = packageJsonLookup.tryGetPackageFolderFor(sourceFilePath);
      expect(foundFolder).toBeDefined();
      expect(foundFolder!.search(/[\\/]example-package$/i)).toBeGreaterThan(0);

      const foundFile: string | undefined = packageJsonLookup.tryGetPackageJsonFilePathFor(sourceFilePath);

      expect(foundFile).toEqual(path.join(foundFolder || '', FileConstants.PackageJson));
    });

    test(`${PackageJsonLookup.prototype.tryGetPackageFolderFor.name} test package with inner package.json with no name`, () => {
      const packageJsonLookup: PackageJsonLookup = new PackageJsonLookup();
      const sourceFilePath: string = path.join(
        __dirname,
        './test-data/example-subdir-package-no-name/src/ExampleFile.txt'
      );

      // Example: C:\rushstack\libraries\node-core-library\src\test\example-subdir-package-no-name
      const foundFolder: string | undefined = packageJsonLookup.tryGetPackageFolderFor(sourceFilePath);
      expect(foundFolder).toBeDefined();
      expect(foundFolder!.search(/[\\/]example-subdir-package-no-name$/i)).toBeGreaterThan(0);

      const foundFile: string | undefined = packageJsonLookup.tryGetPackageJsonFilePathFor(sourceFilePath);

      expect(foundFile).toEqual(path.join(foundFolder || '', FileConstants.PackageJson));
    });
  });
});
