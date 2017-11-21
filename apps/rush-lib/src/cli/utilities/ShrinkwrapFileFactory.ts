import { PackageManager } from '../../data/RushConfiguration';
import { BaseShrinkwrapFile } from './base/BaseShrinkwrapFile';
import { NpmShrinkwrapFile } from './npm/NpmShrinkwrapFile';

export class ShrinkwrapFileFactory {
  public static getShrinkwrapFile(packageManager: PackageManager,
    shrinkwrapFilename: string): BaseShrinkwrapFile | undefined {

    if (packageManager === 'npm') {
      return NpmShrinkwrapFile.loadFromFile(shrinkwrapFilename);
    }
    throw new Error(`Invalid package manager: ${packageManager}`);
  }
}