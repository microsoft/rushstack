// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

console.log('ShrinkwrapFileFactory.ts  : 1: ' + (new Date().getTime() % 20000) / 1000.0);
import { PackageManagerName } from '../api/packageManager/PackageManager';
console.log('ShrinkwrapFileFactory.ts  : 2: ' + (new Date().getTime() % 20000) / 1000.0);
import { BaseShrinkwrapFile } from './base/BaseShrinkwrapFile';
console.log('ShrinkwrapFileFactory.ts  : 3: ' + (new Date().getTime() % 20000) / 1000.0);
import { NpmShrinkwrapFile } from './npm/NpmShrinkwrapFile';
console.log('ShrinkwrapFileFactory.ts  : 4: ' + (new Date().getTime() % 20000) / 1000.0);
import { PnpmShrinkwrapFile } from './pnpm/PnpmShrinkwrapFile';
console.log('ShrinkwrapFileFactory.ts  : 5: ' + (new Date().getTime() % 20000) / 1000.0);
import { YarnShrinkwrapFile } from './yarn/YarnShrinkwrapFile';
console.log('ShrinkwrapFileFactory.ts  : 6: ' + (new Date().getTime() % 20000) / 1000.0);
import { PackageManagerOptionsConfigurationBase, PnpmOptionsConfiguration } from '../api/RushConfiguration';
console.log('ShrinkwrapFileFactory.ts  : 7: ' + (new Date().getTime() % 20000) / 1000.0);

export class ShrinkwrapFileFactory {
  public static getShrinkwrapFile(
    packageManager: PackageManagerName,
    packageManagerOptions: PackageManagerOptionsConfigurationBase,
    shrinkwrapFilename: string
  ): BaseShrinkwrapFile | undefined {
    switch (packageManager) {
      case 'npm':
        return NpmShrinkwrapFile.loadFromFile(shrinkwrapFilename);
      case 'pnpm':
        return PnpmShrinkwrapFile.loadFromFile(
          shrinkwrapFilename,
          packageManagerOptions as PnpmOptionsConfiguration
        );
      case 'yarn':
        return YarnShrinkwrapFile.loadFromFile(shrinkwrapFilename);
    }
    throw new Error(`Invalid package manager: ${packageManager}`);
  }
}
