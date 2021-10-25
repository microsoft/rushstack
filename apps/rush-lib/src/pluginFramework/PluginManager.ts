// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem, InternalError, ITerminal } from '@rushstack/node-core-library';
import { CommandLineConfiguration } from '../api/CommandLineConfiguration';

import { RushConfiguration } from '../api/RushConfiguration';
import { IRushPluginConfigurationBase } from '../api/RushPluginsConfiguration';
import { DefaultPluginLoader } from './PluginLoader/DefaultPluginLoader';
import { IRushPlugin } from './IRushPlugin';
import { RemotePluginLoader } from './PluginLoader/RemotePluginLoader';
import { RushSession } from './RushSession';
import { PluginLoaderBase } from './PluginLoader/PluginLoaderBase';

export interface IPluginManagerOptions {
  terminal: ITerminal;
  rushConfiguration: RushConfiguration;
  rushSession: RushSession;
}

export class PluginManager {
  private _terminal: ITerminal;
  private _rushConfiguration: RushConfiguration;
  private _rushSession: RushSession;
  private _defaultPluginLoaders: DefaultPluginLoader[];
  private _remotePluginLoaders: RemotePluginLoader[];
  private _installedAutoinstallerNames: Set<string>;
  private _loadedPluginNames: Set<string> = new Set<string>();

  private _error: Error | undefined;

  public constructor(options: IPluginManagerOptions) {
    this._terminal = options.terminal;
    this._rushConfiguration = options.rushConfiguration;
    this._rushSession = options.rushSession;

    this._installedAutoinstallerNames = new Set<string>();

    const defaultPluginConfigurations: IRushPluginConfigurationBase[] = [
      {
        packageName: '@rushstack/rush-amazon-s3-build-cache-plugin',
        pluginName: 'rush-amazon-s3-build-cache-plugin'
      },
      {
        packageName: '@rushstack/rush-azure-storage-build-cache-plugin',
        pluginName: 'rush-azure-storage-build-cache-plugin'
      }
    ];
    this._defaultPluginLoaders = defaultPluginConfigurations.map((pluginConfiguration) => {
      return new DefaultPluginLoader({
        pluginConfiguration,
        rushConfiguration: this._rushConfiguration,
        terminal: this._terminal
      });
    });

    this._remotePluginLoaders = (
      this._rushConfiguration?.rushPluginsConfiguration.configuration.plugins ?? []
    ).map((pluginConfiguration) => {
      return new RemotePluginLoader({
        pluginConfiguration,
        rushConfiguration: this._rushConfiguration,
        terminal: this._terminal
      });
    });
  }

  public get error(): Error | undefined {
    return this._error;
  }

  public async updateAsync(): Promise<void> {
    await this._preparePluginAutoinstallersAsync(this._remotePluginLoaders);
    for (const pluginLoader of this._remotePluginLoaders) {
      pluginLoader.update();
    }
  }

  public async reinitializeAllPluginsForCommandAsync(commandName: string): Promise<void> {
    this._error = undefined;
    await this.tryInitializeUnassociatedPluginsAsync();
    await this.tryInitializeAssociatedCommandPluginsAsync(commandName);
  }

  public async _preparePluginAutoinstallersAsync(pluginLoaders: RemotePluginLoader[]): Promise<void> {
    for (const { autoinstaller, packageName } of pluginLoaders) {
      if (!this._installedAutoinstallerNames.has(autoinstaller.name)) {
        await autoinstaller.prepareAsync();
        FileSystem.ensureEmptyFolder(RemotePluginLoader.getPluginStorePath(autoinstaller, packageName));
        this._installedAutoinstallerNames.add(autoinstaller.name);
      }
    }
  }

  public async tryInitializeUnassociatedPluginsAsync(): Promise<void> {
    try {
      const remotePluginLoaders: RemotePluginLoader[] = this._getUnassociatedPluginLoaders(
        this._remotePluginLoaders
      );
      await this._preparePluginAutoinstallersAsync(remotePluginLoaders);
      const defaultPluginLoaders: DefaultPluginLoader[] = this._getUnassociatedPluginLoaders(
        this._defaultPluginLoaders
      );
      await this._initializePluginsAsync([...defaultPluginLoaders, ...remotePluginLoaders]);
    } catch (e) {
      this._error = e as Error;
    }
  }

  public async tryInitializeAssociatedCommandPluginsAsync(commandName: string): Promise<void> {
    try {
      const remotePluginLoaders: RemotePluginLoader[] = this._getPluginLoadersForCommand(
        commandName,
        this._remotePluginLoaders
      );
      await this._preparePluginAutoinstallersAsync(remotePluginLoaders);
      const defaultPluginLoaders: DefaultPluginLoader[] = this._getPluginLoadersForCommand(
        commandName,
        this._defaultPluginLoaders
      );
      await this._initializePluginsAsync([...defaultPluginLoaders, ...remotePluginLoaders]);
    } catch (e) {
      this._error = e as Error;
    }
  }

  public tryGetCustomCommandLineConfigurations(): CommandLineConfiguration[] {
    const commandLineConfigurations: CommandLineConfiguration[] = [];
    for (const pluginLoader of this._remotePluginLoaders) {
      const commandLineConfiguration: CommandLineConfiguration | undefined =
        pluginLoader.getCommandLineConfiguration();
      if (commandLineConfiguration) {
        commandLineConfigurations.push(commandLineConfiguration);
      }
    }
    return commandLineConfigurations;
  }

  private async _initializePluginsAsync(pluginLoaders: PluginLoaderBase[]): Promise<void> {
    const pluginInfos: { plugin: IRushPlugin; pluginName: string }[] = [];
    for (const pluginLoader of pluginLoaders) {
      const pluginName: string = pluginLoader.pluginName;
      if (this._loadedPluginNames.has(pluginName)) {
        throw new Error(
          `Plugin "${pluginName}" has already been loaded. Please check your rush-plugins.json.`
        );
      }
      const plugin: IRushPlugin | undefined = pluginLoader.load();
      if (plugin) {
        pluginInfos.push({
          pluginName,
          plugin
        });
        this._loadedPluginNames.add(pluginName);
      }
    }
    for (const { plugin, pluginName } of pluginInfos) {
      this._applyPlugin(plugin, pluginName);
    }
  }

  private _getUnassociatedPluginLoaders<T extends RemotePluginLoader | DefaultPluginLoader>(
    pluginLoaders: T[]
  ): T[] {
    return pluginLoaders.filter((pluginLoader) => {
      return !pluginLoader.pluginManifest.associatedCommands;
    });
  }

  private _getPluginLoadersForCommand<T extends RemotePluginLoader | DefaultPluginLoader>(
    commandName: string,
    pluginLoaders: T[]
  ): T[] {
    return pluginLoaders.filter((pluginLoader) => {
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
