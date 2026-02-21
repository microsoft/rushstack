// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { RushConstants } from '../../logic/RushConstants.ts';
import { PackageManager } from './PackageManager.ts';

/**
 * Support for interacting with the Yarn package manager.
 */
export class YarnPackageManager extends PackageManager {
  /** @internal */
  public constructor(version: string) {
    super(version, 'yarn', RushConstants.yarnShrinkwrapFilename);
  }
}
