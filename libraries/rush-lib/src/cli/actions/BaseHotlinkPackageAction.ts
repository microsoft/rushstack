// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import path from 'node:path';

import type { IRequiredCommandLineStringParameter } from '@rushstack/ts-command-line';

import { HotlinkManager } from '../../utilities/HotlinkManager';
import { BaseRushAction, type IBaseRushActionOptions } from './BaseRushAction';

export abstract class BaseHotlinkPackageAction extends BaseRushAction {
  protected readonly _pathParameter: IRequiredCommandLineStringParameter;

  protected constructor(options: IBaseRushActionOptions) {
    super(options);

    this._pathParameter = this.defineStringParameter({
      parameterLongName: '--path',
      argumentName: 'PATH',
      required: true,
      description:
        'The path of folder of a project outside of this Rush repo, whose installation will be simulated using' +
        ' node_modules symlinks ("hotlinks").  This folder is the symlink target.'
    });
  }

  protected abstract hotlinkPackageAsync(
    linkedPackagePath: string,
    hotlinkManager: HotlinkManager
  ): Promise<void>;

  protected async runAsync(): Promise<void> {
    const hotlinkManager: HotlinkManager = HotlinkManager.loadFromRushConfiguration(this.rushConfiguration);
    const linkedPackagePath: string = path.resolve(process.cwd(), this._pathParameter.value);
    await this.hotlinkPackageAsync(linkedPackagePath, hotlinkManager);
  }
}
