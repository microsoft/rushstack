import { PackageManagerName } from '../api/packageManager/PackageManager';
import { BaseShrinkwrapFile } from './base/BaseShrinkwrapFile';
import { NpmShrinkwrapFile } from './npm/NpmShrinkwrapFile';
import { PnpmShrinkwrapFile } from './pnpm/PnpmShrinkwrapFile';
import { YarnShrinkwrapFile } from './yarn/YarnShrinkwrapFile';

export class ShrinkwrapFileFactory {
  public static getShrinkwrapFile(
    packageManager: PackageManagerName,
    shrinkwrapFilename: string
  ): BaseShrinkwrapFile | undefined {
    switch (packageManager) {
      case 'npm':
        return NpmShrinkwrapFile.loadFromFile(shrinkwrapFilename);
      case 'pnpm':
        return PnpmShrinkwrapFile.loadFromFile(shrinkwrapFilename);
      case 'yarn':
        return YarnShrinkwrapFile.loadFromFile(shrinkwrapFilename);
    }
    throw new Error(`Invalid package manager: ${packageManager}`);
  }
}
