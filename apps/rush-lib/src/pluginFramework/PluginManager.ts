// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { InternalError, ITerminal } from '@rushstack/node-core-library';
import { CommandLineConfiguration } from '../api/CommandLineConfiguration';

import { RushConfiguration } from '../api/RushConfiguration';
import { Autoinstaller } from '../logic/Autoinstaller';
import { IRushPlugin } from './IRushPlugin';
import { PluginLoader } from './PluginLoader';
import { RushSession } from './RushSession';

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
    for (const pluginLoader of this._pluginLoaders) {
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

  public async tryInitializeUnassociatedPluginsAsync(): Promise<void> {
    try {
      const pluginLoaders: PluginLoader[] = this._getUnassociatedPluginLoaders();
      await this._preparePluginAutoinstallersAsync(pluginLoaders);
      await this._initializePluginsAsync(pluginLoaders);
    } catch (e) {
      this._error = e as Error;
    }
  }

  public async tryInitializeAssociatedCommandPluginsAsync(commandName: string): Promise<void> {
    try {
      const pluginLoaders: PluginLoader[] = this._getPluginLoadersForCommand(commandName);
      await this._preparePluginAutoinstallersAsync(pluginLoaders);
      await this._initializePluginsAsync(pluginLoaders);
    } catch (e) {
      this._error = e as Error;
    }
  }

  public tryGetCustomCommandLineConfigurations(): CommandLineConfiguration[] {
    const commandLineConfigurations: CommandLineConfiguration[] = [];
    for (const pluginLoader of this._pluginLoaders) {
      const commandLineConfiguration: CommandLineConfiguration | undefined =
        pluginLoader.getCommandLineConfiguration();
      if (commandLineConfiguration) {
        commandLineConfigurations.push(commandLineConfiguration);
      }
    }
    return commandLineConfigurations;
  }

  private async _initializePluginsAsync(pluginLoaders: PluginLoader[]): Promise<void> {
    const pluginInfos: { plugin: IRushPlugin; pluginName: string }[] = [];
    for (const pluginLoader of pluginLoaders) {
      const plugin: IRushPlugin | undefined = pluginLoader.load();
      if (plugin) {
        pluginInfos.push({
          pluginName: pluginLoader.configuration.pluginName,
          plugin
        });
      }
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
