import { PackageManager } from '../../data/RushConfiguration';
import { BaseShrinkwrapFile } from './base/BaseShrinkwrapFile';
import { NpmShrinkwrapFile } from './npm/NpmShrinkwrapFile';
import { PnpmShrinkwrapFile } from './pnpm/PnpmShrinkwrapFile';

export class ShrinkwrapFileFactory {
  public static getShrinkwrapFile(packageManager: PackageManager,
    shrinkwrapFilename: string): BaseShrinkwrapFile | undefined {

    if (packageManager === 'npm') {
      return NpmShrinkwrapFile.loadFromFile(shrinkwrapFilename);
    } else if (packageManager === 'pnpm') {
      return PnpmShrinkwrapFile.loadFromFile(shrinkwrapFilename);
    }
    throw new Error(`Invalid package manager: ${packageManager}`);
  }
}