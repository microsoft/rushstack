// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { PackageManagerName } from '../api/packageManager/PackageManager';
import type { BaseShrinkwrapFile } from './base/BaseShrinkwrapFile';
import { NpmShrinkwrapFile } from './npm/NpmShrinkwrapFile';
import { PnpmShrinkwrapFile } from './pnpm/PnpmShrinkwrapFile';
import { YarnShrinkwrapFile } from './yarn/YarnShrinkwrapFile';

export class ShrinkwrapFileFactory {
  public static async getShrinkwrapFileAsync(
    packageManager: PackageManagerName,
    shrinkwrapFilename: string
  ): Promise<BaseShrinkwrapFile | undefined> {
    switch (packageManager) {
      case 'npm':
        return NpmShrinkwrapFile.loadFromFile(shrinkwrapFilename);
      case 'pnpm':
        return await PnpmShrinkwrapFile.loadFromFileAsync(shrinkwrapFilename);
      case 'yarn':
        return YarnShrinkwrapFile.loadFromFile(shrinkwrapFilename);
      default:
        throw new Error(`Invalid package manager: ${packageManager}`);
    }
  }

  public static async parseShrinkwrapFileAsync(
    packageManager: PackageManagerName,
    shrinkwrapContent: string
  ): Promise<BaseShrinkwrapFile | undefined> {
    switch (packageManager) {
      case 'npm':
        return NpmShrinkwrapFile.loadFromString(shrinkwrapContent);
      case 'pnpm':
        return await PnpmShrinkwrapFile.loadFromStringAsync(shrinkwrapContent);
      case 'yarn':
        return YarnShrinkwrapFile.loadFromString(shrinkwrapContent);
      default:
        throw new Error(`Invalid package manager: ${packageManager}`);
    }
  }
}
