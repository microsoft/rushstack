// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem, InternalError, IPackageJson, ITerminal } from '@rushstack/node-core-library';
import { CommandLineConfiguration } from '../api/CommandLineConfiguration';

import { RushConfiguration } from '../api/RushConfiguration';
import { IRushPluginConfigurationBase } from '../api/RushPluginsConfiguration';
import { BuiltInPluginLoader } from './PluginLoader/BuiltInPluginLoader';
import { IRushPlugin } from './IRushPlugin';
import { RemotePluginLoader } from './PluginLoader/RemotePluginLoader';
import { RushSession } from './RushSession';
import { PluginLoaderBase } from './PluginLoader/PluginLoaderBase';

export interface IPluginManagerOptions {
  terminal: ITerminal;
  rushConfiguration: RushConfiguration;
  rushSession: RushSession;
}

export interface ICustomCommandLineConfigurationInfo {
  commandLineConfiguration: CommandLineConfiguration;
  pluginLoader: PluginLoaderBase;
}

export class PluginManager {
  private readonly _terminal: ITerminal;
  private readonly _rushConfiguration: RushConfiguration;
  private readonly _rushSession: RushSession;
  private readonly _builtInPluginLoaders: BuiltInPluginLoader[];
  private readonly _remotePluginLoaders: RemotePluginLoader[];
  private readonly _installedAutoinstallerNames: Set<string>;
  private readonly _loadedPluginNames: Set<string> = new Set<string>();

  private _error: Error | undefined;

  public constructor(options: IPluginManagerOptions) {
    this._terminal = options.terminal;
    this._rushConfiguration = options.rushConfiguration;
    this._rushSession = options.rushSession;

    this._installedAutoinstallerNames = new Set<string>();

    // Eventually we will require end users to explicitly configure all Rush plugins in use, regardless of
    // whether they are first party or third party plugins.  However, we're postponing that requirement
    // until after the plugin feature has stabilized and is fully documented.  In the meantime, Rush's
    // built-in plugins are dependencies of @microsoft/rush-lib and get loaded by default (without any
    // configuration).
    //
    // The plugins have devDependencies on Rush, which would create a circular dependency in our local
    // workspace if we added them to rush-lib/package.json.  Instead we put them in a special section
    // "publishOnlyDependencies" which gets moved into "dependencies" during publishing.
    const builtInPluginConfigurations: IRushPluginConfigurationBase[] = [];

    const ownPackageJson: IPackageJson = require('../../package.json');
    if (ownPackageJson.dependencies!['@rushstack/rush-amazon-s3-build-cache-plugin']) {
      builtInPluginConfigurations.push({
        packageName: '@rushstack/rush-amazon-s3-build-cache-plugin',
        pluginName: 'rush-amazon-s3-build-cache-plugin'
      });
    }
    if (ownPackageJson.dependencies!['@rushstack/rush-azure-storage-build-cache-plugin']) {
      builtInPluginConfigurations.push({
        packageName: '@rushstack/rush-azure-storage-build-cache-plugin',
        pluginName: 'rush-azure-storage-build-cache-plugin'
      });
    }

    this._builtInPluginLoaders = builtInPluginConfigurations.map((pluginConfiguration) => {
      return new BuiltInPluginLoader({
        pluginConfiguration,
        rushConfiguration: this._rushConfiguration,
        terminal: this._terminal
      });
    });

    this._remotePluginLoaders = (
      this._rushConfiguration?._rushPluginsConfiguration.configuration.plugins ?? []
    ).map((pluginConfiguration) => {
      return new RemotePluginLoader({
        pluginConfiguration,
        rushConfiguration: this._rushConfiguration,
        terminal: this._terminal
      });
    });
  }

  /**
   * If an error occurs while attempting to load plugins, it will be saved in this property.
   * Rush will attempt to continue and will report the error later by `BaseRushAction._throwPluginErrorIfNeed()`
   * (unless we are invoking a command that is used to fix plugin problems).
   */
  public get error(): Error | undefined {
    return this._error;
  }

  public async updateAsync(): Promise<void> {
    await this._preparePluginAutoinstallersAsync(this._remotePluginLoaders);
    const preparedAutoinstallerNames: Set<string> = new Set<string>();
    for (const { autoinstaller } of this._remotePluginLoaders) {
      const storePath: string = RemotePluginLoader.getPluginAutoinstallerStorePath(autoinstaller);
      if (!preparedAutoinstallerNames.has(autoinstaller.name)) {
        FileSystem.ensureEmptyFolder(storePath);
        preparedAutoinstallerNames.add(autoinstaller.name);
      }
    }
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
    for (const { autoinstaller } of pluginLoaders) {
      if (!this._installedAutoinstallerNames.has(autoinstaller.name)) {
        await autoinstaller.prepareAsync();
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
      const builtInPluginLoaders: BuiltInPluginLoader[] = this._getUnassociatedPluginLoaders(
        this._builtInPluginLoaders
      );
      this._initializePlugins([...builtInPluginLoaders, ...remotePluginLoaders]);
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
      const builtInPluginLoaders: BuiltInPluginLoader[] = this._getPluginLoadersForCommand(
        commandName,
        this._builtInPluginLoaders
      );
      this._initializePlugins([...builtInPluginLoaders, ...remotePluginLoaders]);
    } catch (e) {
      this._error = e as Error;
    }
  }

  public tryGetCustomCommandLineConfigurationInfos(): ICustomCommandLineConfigurationInfo[] {
    const commandLineConfigurationInfos: ICustomCommandLineConfigurationInfo[] = [];
    for (const pluginLoader of this._remotePluginLoaders) {
      const commandLineConfiguration: CommandLineConfiguration | undefined =
        pluginLoader.getCommandLineConfiguration();
      if (commandLineConfiguration) {
        commandLineConfigurationInfos.push({
          commandLineConfiguration,
          pluginLoader
        });
      }
    }
    return commandLineConfigurationInfos;
  }

  private _initializePlugins(pluginLoaders: PluginLoaderBase[]): void {
    for (const pluginLoader of pluginLoaders) {
      const pluginName: string = pluginLoader.pluginName;
      if (this._loadedPluginNames.has(pluginName)) {
        throw new Error(`Error applying plugin: A plugin with name "${pluginName}" has already been applied`);
      }
      const plugin: IRushPlugin | undefined = pluginLoader.load();
      this._loadedPluginNames.add(pluginName);
      if (plugin) {
        this._applyPlugin(plugin, pluginName);
      }
    }
  }

  private _getUnassociatedPluginLoaders<T extends RemotePluginLoader | BuiltInPluginLoader>(
    pluginLoaders: T[]
  ): T[] {
    return pluginLoaders.filter((pluginLoader) => {
      return !pluginLoader.pluginManifest.associatedCommands;
    });
  }

  private _getPluginLoadersForCommand<T extends RemotePluginLoader | BuiltInPluginLoader>(
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
