// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Import, InternalError, ITerminal } from '@rushstack/node-core-library';

import { RushConfiguration } from '../api/RushConfiguration';
import { Autoinstaller } from '../logic/Autoinstaller';
import { IRushPlugin } from './IRushPlugin';
import { PluginLoader } from './PluginLoader';
import { RushSession } from './RushSession';

const lodash: typeof import('lodash') = Import.lazy('lodash', require);

export interface IPluginManagerOptions {
  terminal: ITerminal;
  rushConfiguration: RushConfiguration;
  rushSession: RushSession;
}

export class PluginManager {
  private _terminal: ITerminal;
  private _rushConfiguration: RushConfiguration;
  private _rushSession: RushSession;
  private _pluginLoaders: PluginLoader[];

  public constructor(options: IPluginManagerOptions) {
    this._terminal = options.terminal;
    this._rushConfiguration = options.rushConfiguration;
    this._rushSession = options.rushSession;

    this._pluginLoaders = (this._rushConfiguration?.rushPluginsConfiguration.configuration.plugins ?? []).map(
      (pluginConfiguration) => {
        return new PluginLoader({
          pluginConfiguration,
          rushConfiguration: this._rushConfiguration,
          terminal: this._terminal
        });
      }
    );
  }

  public async updateAsync(): Promise<void> {
    await this.prepareAsync();
    const uniqPluginPackageWithAutoinstallerName: PluginLoader[] = lodash.uniqBy(
      this._pluginLoaders,
      (pluginLoader) => {
        return `${pluginLoader.configuration.packageName}$${pluginLoader.autoinstaller.name}`;
      }
    );
    for (const pluginLoader of uniqPluginPackageWithAutoinstallerName) {
      pluginLoader.update();
    }
  }

  public async tryInitializePluginsAsync(): Promise<boolean> {
    let loadFailed: boolean = false;
    const pluginInfos: { plugin: IRushPlugin; pluginName: string }[] = [];
    try {
      for (const pluginLoader of this._pluginLoaders) {
        pluginInfos.push({
          plugin: pluginLoader.load(),
          pluginName: pluginLoader.configuration.pluginName
        });
      }
    } catch (e) {
      if (e instanceof PluginLoader.NeedUpdateError) {
        loadFailed = true;
      } else {
        throw e;
      }
    }
    if (!loadFailed) {
      for (const { plugin, pluginName } of pluginInfos) {
        this._applyPlugin(plugin, pluginName);
      }
    }
    return !loadFailed;
  }

  public async prepareAsync(): Promise<void> {
    const uniqAutoinstallers: Autoinstaller[] = lodash.uniqBy(
      this._pluginLoaders.map((pluginLoader) => pluginLoader.autoinstaller),
      (autoinstaller) => autoinstaller.name
    );
    for (const autoInstaller of uniqAutoinstallers) {
      await autoInstaller.prepareAsync();
    }
  }

  private _applyPlugin(plugin: IRushPlugin, pluginName: string): void {
    try {
      plugin.apply(this._rushSession, this._rushConfiguration);
    } catch (e) {
      throw new InternalError(`Error applying "${pluginName}": ${e}`);
    }
  }
}
