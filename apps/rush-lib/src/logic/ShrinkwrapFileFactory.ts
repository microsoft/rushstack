import { PackageManagerName } from '../api/packageManager/PackageManager';
import { BaseShrinkwrapFile } from './base/BaseShrinkwrapFile';
import { NpmShrinkwrapFile } from './npm/NpmShrinkwrapFile';
import { PnpmShrinkwrapFile } from './pnpm/PnpmShrinkwrapFile';
import { YarnShrinkwrapFile } from './yarn/YarnShrinkwrapFile';
import { PackageManagerOptionsConfigurationBase, PnpmOptionsConfiguration } from '../api/RushConfiguration';

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
