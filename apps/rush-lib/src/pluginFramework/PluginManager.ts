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
  private _installedAutoinstallerNames: Set<string>;

  private _error: Error | undefined;

  public constructor(options: IPluginManagerOptions) {
    this._terminal = options.terminal;
    this._rushConfiguration = options.rushConfiguration;
    this._rushSession = options.rushSession;

    this._installedAutoinstallerNames = new Set<string>();

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

  public get error(): Error | undefined {
    return this._error;
  }

  public async updateAsync(): Promise<void> {
    await this._preparePluginAutoinstallersAsync(this._pluginLoaders);
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

  public async _preparePluginAutoinstallersAsync(pluginLoaders: PluginLoader[]): Promise<void> {
    const autoinstallers: Autoinstaller[] = pluginLoaders.map((pluginLoader) => {
      return pluginLoader.autoinstaller;
    });
    for (const autoInstaller of autoinstallers) {
      if (!this._installedAutoinstallerNames.has(autoInstaller.name)) {
        await autoInstaller.prepareAsync();
        this._installedAutoinstallerNames.add(autoInstaller.name);
      }
    }
  }

  public async tryInitializePluginsAsync(): Promise<void> {
    try {
      const pluginLoaders: PluginLoader[] = this._getUnassociatedPluginLoaders();
      await this._preparePluginAutoinstallersAsync(pluginLoaders);
      await this._initializePluginsAsync(pluginLoaders);
    } catch (e) {
      this._error = e as Error;
    }
  }

  public async tryInitializePluginsForCommand(commandName: string): Promise<void> {
    try {
      const pluginLoaders: PluginLoader[] = this._getPluginLoadersForCommand(commandName);
      await this._preparePluginAutoinstallersAsync(pluginLoaders);
      await this._initializePluginsAsync(pluginLoaders);
    } catch (e) {
      this._error = e as Error;
    }
  }

  private async _initializePluginsAsync(pluginLoaders: PluginLoader[]): Promise<void> {
    const pluginInfos: { plugin: IRushPlugin; pluginName: string }[] = [];
    for (const pluginLoader of pluginLoaders) {
      pluginInfos.push({
        plugin: pluginLoader.load(),
        pluginName: pluginLoader.configuration.pluginName
      });
    }
    for (const { plugin, pluginName } of pluginInfos) {
      this._applyPlugin(plugin, pluginName);
    }
  }

  private _getUnassociatedPluginLoaders(): PluginLoader[] {
    return this._pluginLoaders.filter((pluginLoader) => {
      return !pluginLoader.pluginManifest.associatedCommands;
    });
  }

  private _getPluginLoadersForCommand(commandName: string): PluginLoader[] {
    return this._pluginLoaders.filter((pluginLoader) => {
      return pluginLoader.pluginManifest.associatedCommands?.includes(commandName);
    });
  }

  private _applyPlugin(plugin: IRushPlugin, pluginName: string): void {
    try {
      plugin.apply(this._rushSession, this._rushConfiguration);
    } catch (e) {
      throw new InternalError(`Error applying "${pluginName}": ${e}`);
    }
  }
}
