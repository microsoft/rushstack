// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { IDefaultRushPluginConfiguration } from '../../api/RushPluginsConfiguration';
import { IPluginLoaderOptions, PluginLoaderBase } from './PluginLoaderBase';

export interface IDefaultPluginLoaderOptions extends IPluginLoaderOptions {
  pluginConfiguration: IDefaultRushPluginConfiguration;
}

export class DefaultPluginLoader extends PluginLoaderBase {
  private _packageFolder: string;

  public constructor(options: IDefaultPluginLoaderOptions) {
    super(options);
    this._packageFolder = options.pluginConfiguration.packageFolder;
  }

  public getPackageFolder(): string {
    return this._packageFolder;
  }
}
