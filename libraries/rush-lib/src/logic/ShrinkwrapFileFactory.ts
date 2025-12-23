// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { PackageManagerName } from '../api/packageManager/PackageManager';
import type { BaseShrinkwrapFile } from './base/BaseShrinkwrapFile';
import { NpmShrinkwrapFile } from './npm/NpmShrinkwrapFile';
import { PnpmShrinkwrapFile } from './pnpm/PnpmShrinkwrapFile';
import { YarnShrinkwrapFile } from './yarn/YarnShrinkwrapFile';

export interface IShrinkwrapFileFactoryOptions {
  packageManager: PackageManagerName;
  subspaceHasNoProjects: boolean;
}

export interface IGetShrinkwrapFileOptions extends IShrinkwrapFileFactoryOptions {
  shrinkwrapFilePath: string;
}

export interface IParseShrinkwrapFileOptions extends IShrinkwrapFileFactoryOptions {
  shrinkwrapContent: string;
}

export class ShrinkwrapFileFactory {
  public static getShrinkwrapFile(options: IGetShrinkwrapFileOptions): BaseShrinkwrapFile | undefined {
    const { packageManager, shrinkwrapFilePath, subspaceHasNoProjects } = options;
    switch (packageManager) {
      case 'npm':
        return NpmShrinkwrapFile.loadFromFile(shrinkwrapFilePath);
      case 'pnpm':
        return PnpmShrinkwrapFile.loadFromFile(shrinkwrapFilePath, { subspaceHasNoProjects });
      case 'yarn':
        return YarnShrinkwrapFile.loadFromFile(shrinkwrapFilePath);
      default:
        throw new Error(`Invalid package manager: ${packageManager}`);
    }
  }

  public static parseShrinkwrapFile(options: IParseShrinkwrapFileOptions): BaseShrinkwrapFile | undefined {
    const { packageManager, shrinkwrapContent, subspaceHasNoProjects } = options;
    switch (packageManager) {
      case 'npm':
        return NpmShrinkwrapFile.loadFromString(shrinkwrapContent);
      case 'pnpm':
        return PnpmShrinkwrapFile.loadFromString(shrinkwrapContent, { subspaceHasNoProjects });
      case 'yarn':
        return YarnShrinkwrapFile.loadFromString(shrinkwrapContent);
      default:
        throw new Error(`Invalid package manager: ${packageManager}`);
    }
  }
}
