// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IRushPluginConfigurationBase } from '../../api/RushPluginsConfiguration.ts';
import { type IPluginLoaderOptions, PluginLoaderBase } from './PluginLoaderBase.ts';

/**
 * @internal
 */
export interface IBuiltInPluginConfiguration extends IRushPluginConfigurationBase {
  pluginPackageFolder: string;
}

/**
 * @remarks
 * Used to load plugins that are dependencies of Rush.
 */
export class BuiltInPluginLoader extends PluginLoaderBase<IBuiltInPluginConfiguration> {
  public readonly packageFolder: string;

  public constructor(options: IPluginLoaderOptions<IBuiltInPluginConfiguration>) {
    super(options);
    this.packageFolder = options.pluginConfiguration.pluginPackageFolder;
  }
}
