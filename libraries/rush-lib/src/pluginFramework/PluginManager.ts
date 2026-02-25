// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem, Import, InternalError } from '@rushstack/node-core-library';
import type { ITerminal } from '@rushstack/terminal';

import type { CommandLineConfiguration } from '../api/CommandLineConfiguration.ts';
import type { RushConfiguration } from '../api/RushConfiguration.ts';
import { BuiltInPluginLoader, type IBuiltInPluginConfiguration } from './PluginLoader/BuiltInPluginLoader.ts';
import type { IRushPlugin } from './IRushPlugin.ts';
import { AutoinstallerPluginLoader } from './PluginLoader/AutoinstallerPluginLoader.ts';
import type { RushSession } from './RushSession.ts';
import type { PluginLoaderBase } from './PluginLoader/PluginLoaderBase.ts';
import { Rush } from '../api/Rush.ts';
import type { RushGlobalFolder } from '../api/RushGlobalFolder.ts';

export interface IPluginManagerOptions {
  terminal: ITerminal;
  rushConfiguration: RushConfiguration;
  rushSession: RushSession;
  builtInPluginConfigurations: IBuiltInPluginConfiguration[];
  restrictConsoleOutput: boolean;
  rushGlobalFolder: RushGlobalFolder;
}

export interface ICustomCommandLineConfigurationInfo {
  commandLineConfiguration: CommandLineConfiguration;
  pluginLoader: PluginLoaderBase;
}

export class PluginManager {
  private readonly _terminal: ITerminal;
  private readonly _rushConfiguration: RushConfiguration;
  private readonly _rushSession: RushSession;
  private readonly _restrictConsoleOutput: boolean;
  private readonly _builtInPluginLoaders: BuiltInPluginLoader[];
  private readonly _autoinstallerPluginLoaders: AutoinstallerPluginLoader[];
  private readonly _installedAutoinstallerNames: Set<string>;
  private readonly _loadedPluginNames: Set<string> = new Set<string>();
  private readonly _rushGlobalFolder: RushGlobalFolder;

  private _error: Error | undefined;

  public constructor(options: IPluginManagerOptions) {
    this._terminal = options.terminal;
    this._rushConfiguration = options.rushConfiguration;
    this._rushSession = options.rushSession;
    this._restrictConsoleOutput = options.restrictConsoleOutput;
    this._rushGlobalFolder = options.rushGlobalFolder;

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
    const builtInPluginConfigurations: IBuiltInPluginConfiguration[] = options.builtInPluginConfigurations;

    const ownPackageJsonDependencies: Record<string, string> = Rush._rushLibPackageJson.dependencies || {};
    function tryAddBuiltInPlugin(builtInPluginName: string, pluginPackageName?: string): void {
      if (!pluginPackageName) {
        pluginPackageName = `@rushstack/${builtInPluginName}`;
      }
      if (ownPackageJsonDependencies[pluginPackageName]) {
        builtInPluginConfigurations.push({
          packageName: pluginPackageName,
          pluginName: builtInPluginName,
          pluginPackageFolder: Import.resolvePackage({
            packageName: pluginPackageName,
            baseFolderPath: __dirname
          })
        });
      }
    }

    tryAddBuiltInPlugin('rush-amazon-s3-build-cache-plugin');
    tryAddBuiltInPlugin('rush-azure-storage-build-cache-plugin');
    tryAddBuiltInPlugin('rush-http-build-cache-plugin');
    // This is a secondary plugin inside the `@rushstack/rush-azure-storage-build-cache-plugin`
    // package. Because that package comes with Rush (for now), it needs to get registered here.
    // If the necessary config file doesn't exist, this plugin doesn't do anything.
    tryAddBuiltInPlugin(
      'rush-azure-interactive-auth-plugin',
      '@rushstack/rush-azure-storage-build-cache-plugin'
    );

    this._builtInPluginLoaders = builtInPluginConfigurations.map((pluginConfiguration) => {
      return new BuiltInPluginLoader({
        pluginConfiguration,
        rushConfiguration: this._rushConfiguration,
        terminal: this._terminal
      });
    });

    this._autoinstallerPluginLoaders = (
      this._rushConfiguration?._rushPluginsConfiguration.configuration.plugins ?? []
    ).map((pluginConfiguration) => {
      return new AutoinstallerPluginLoader({
        pluginConfiguration,
        rushConfiguration: this._rushConfiguration,
        terminal: this._terminal,
        restrictConsoleOutput: this._restrictConsoleOutput,
        rushGlobalFolder: this._rushGlobalFolder
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
    await this._preparePluginAutoinstallersAsync(this._autoinstallerPluginLoaders);
    const preparedAutoinstallerNames: Set<string> = new Set<string>();
    for (const { autoinstaller } of this._autoinstallerPluginLoaders) {
      const storePath: string = AutoinstallerPluginLoader.getPluginAutoinstallerStorePath(autoinstaller);
      if (!preparedAutoinstallerNames.has(autoinstaller.name)) {
        FileSystem.ensureEmptyFolder(storePath);
        preparedAutoinstallerNames.add(autoinstaller.name);
      }
    }
    for (const pluginLoader of this._autoinstallerPluginLoaders) {
      pluginLoader.update();
    }
  }

  public async reinitializeAllPluginsForCommandAsync(commandName: string): Promise<void> {
    this._error = undefined;
    await this.tryInitializeUnassociatedPluginsAsync();
    await this.tryInitializeAssociatedCommandPluginsAsync(commandName);
  }

  public async _preparePluginAutoinstallersAsync(pluginLoaders: AutoinstallerPluginLoader[]): Promise<void> {
    for (const { autoinstaller } of pluginLoaders) {
      if (!this._installedAutoinstallerNames.has(autoinstaller.name)) {
        await autoinstaller.prepareAsync();
        this._installedAutoinstallerNames.add(autoinstaller.name);
      }
    }
  }

  public async tryInitializeUnassociatedPluginsAsync(): Promise<void> {
    try {
      const autoinstallerPluginLoaders: AutoinstallerPluginLoader[] = this._getUnassociatedPluginLoaders(
        this._autoinstallerPluginLoaders
      );
      await this._preparePluginAutoinstallersAsync(autoinstallerPluginLoaders);
      const builtInPluginLoaders: BuiltInPluginLoader[] = this._getUnassociatedPluginLoaders(
        this._builtInPluginLoaders
      );
      this._initializePlugins([...builtInPluginLoaders, ...autoinstallerPluginLoaders]);
    } catch (e) {
      this._error = e as Error;
    }
  }

  public async tryInitializeAssociatedCommandPluginsAsync(commandName: string): Promise<void> {
    try {
      const autoinstallerPluginLoaders: AutoinstallerPluginLoader[] = this._getPluginLoadersForCommand(
        commandName,
        this._autoinstallerPluginLoaders
      );
      await this._preparePluginAutoinstallersAsync(autoinstallerPluginLoaders);
      const builtInPluginLoaders: BuiltInPluginLoader[] = this._getPluginLoadersForCommand(
        commandName,
        this._builtInPluginLoaders
      );
      this._initializePlugins([...builtInPluginLoaders, ...autoinstallerPluginLoaders]);
    } catch (e) {
      this._error = e as Error;
    }
  }

  public tryGetCustomCommandLineConfigurationInfos(): ICustomCommandLineConfigurationInfo[] {
    const commandLineConfigurationInfos: ICustomCommandLineConfigurationInfo[] = [];
    for (const pluginLoader of this._autoinstallerPluginLoaders) {
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

  private _getUnassociatedPluginLoaders<T extends AutoinstallerPluginLoader | BuiltInPluginLoader>(
    pluginLoaders: T[]
  ): T[] {
    return pluginLoaders.filter((pluginLoader) => {
      return !pluginLoader.pluginManifest.associatedCommands;
    });
  }

  private _getPluginLoadersForCommand<T extends AutoinstallerPluginLoader | BuiltInPluginLoader>(
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
