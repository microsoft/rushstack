// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { RigConfig, IRigConfigOptions } from './RigConfig';

interface IResolvedRigConfigOptions extends IRigConfigOptions {
  resolvedRigPackageFolder: string;
}

/** @public */
export class ResolvedRigConfig extends RigConfig {
  public readonly profileFolderPath: string;

  /** @internal */
  public constructor(options: IResolvedRigConfigOptions) {
    super(options);

    if (options.resolvedRigPackageFolder !== undefined) {
      this.profileFolderPath = path.join(options.resolvedRigPackageFolder, this.relativeProfileFolderPath);
    } else {
      this.profileFolderPath = '';
    }
  }
}
