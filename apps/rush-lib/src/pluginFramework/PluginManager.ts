// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem, Import, InternalError, ITerminal } from '@rushstack/node-core-library';

import { CommandLineConfiguration } from '../api/CommandLineConfiguration';
import { RushConfiguration } from '../api/RushConfiguration';
import { BuiltInPluginLoader, IBuiltInPluginConfiguration } from './PluginLoader/BuiltInPluginLoader';
import { IRushPlugin } from './IRushPlugin';
import { AutoinstallerPluginLoader } from './PluginLoader/AutoinstallerPluginLoader';
import { RushSession } from './RushSession';
import { PluginLoaderBase } from './PluginLoader/PluginLoaderBase';
import { PluginManagerLifecycleHooks } from './RushLifeCycle';
import { ContributionPoint } from './ContributionPoint';
import { RushSessionForPlugin } from './RushSessionForPlugin';

export interface IPluginManagerOptions {
  terminal: ITerminal;
  rushConfiguration: RushConfiguration;
  rushSession: RushSession;
  builtInPluginConfigurations: IBuiltInPluginConfiguration[];
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
  private readonly _autoinstallerPluginLoaders: AutoinstallerPluginLoader[];
  private readonly _installedAutoinstallerNames: Set<string>;
  private readonly _loadedPluginNames: Set<string> = new Set<string>();
  private _pluginNameToRushSessionForPlugin: Map<string, RushSessionForPlugin | undefined> = new Map<
    string,
    RushSessionForPlugin
  >();

  private _error: Error | undefined;

  public hooks: PluginManagerLifecycleHooks = new PluginManagerLifecycleHooks();

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
    const builtInPluginConfigurations: IBuiltInPluginConfiguration[] = options.builtInPluginConfigurations;

    const ownPackageJsonDependencies: Record<string, string> = require('../../package.json').dependencies;
    function tryAddBuiltInPlugin(builtInPluginName: string): void {
      const pluginPackageName: string = `@rushstack/${builtInPluginName}`;
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
        terminal: this._terminal
      });
    });

    this._setupInitializeContributions();
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
    await this.tryInitializeEagerPluginsAsync();
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

  public async tryInitializeEagerPluginsAsync(): Promise<void> {
    try {
      const autoinstallerPluginLoaders: AutoinstallerPluginLoader[] = this._getEagerPluginLoaders(
        this._autoinstallerPluginLoaders
      );
      await this._preparePluginAutoinstallersAsync(autoinstallerPluginLoaders);
      const builtInPluginLoaders: BuiltInPluginLoader[] = this._getEagerPluginLoaders(
        this._builtInPluginLoaders
      );
      const targetPluginLoaders: PluginLoaderBase[] = [
        ...builtInPluginLoaders,
        ...autoinstallerPluginLoaders
      ];
      this._initializePlugins(targetPluginLoaders);
      for (const { pluginName } of targetPluginLoaders) {
        this._pluginNameToRushSessionForPlugin.set(pluginName, undefined);
      }
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
      const targetPluginLoaders: PluginLoaderBase[] = [
        ...builtInPluginLoaders,
        ...autoinstallerPluginLoaders
      ];
      this._initializePlugins(targetPluginLoaders);
      for (const { pluginName } of targetPluginLoaders) {
        this._pluginNameToRushSessionForPlugin.set(pluginName, undefined);
      }
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

  public async initializeContributeToBuildCacheProviderPluginsAsync(): Promise<void> {
    await this.hooks.initializeContributionPoints.get(ContributionPoint.buildCacheProvider)?.promise();
  }

  private _initializePlugins(
    pluginLoaders: PluginLoaderBase[],
    { doNotThrowSamePluginName }: { doNotThrowSamePluginName: boolean } = {
      doNotThrowSamePluginName: false
    }
  ): void {
    for (const pluginLoader of pluginLoaders) {
      const pluginName: string = pluginLoader.pluginName;
      if (this._loadedPluginNames.has(pluginName)) {
        if (doNotThrowSamePluginName) {
          // No need to apply same plugin name twice
          return;
        }
        throw new Error(`Error applying plugin: A plugin with name "${pluginName}" has already been applied`);
      }
      const plugin: IRushPlugin | undefined = pluginLoader.load();
      this._loadedPluginNames.add(pluginName);
      if (plugin) {
        this._applyPlugin(plugin, pluginLoader);
      }
    }
  }

  private _getEagerPluginLoaders<T extends AutoinstallerPluginLoader | BuiltInPluginLoader>(
    pluginLoaders: T[]
  ): T[] {
    return pluginLoaders.filter((pluginLoader) => {
      return !pluginLoader.pluginManifest.associatedCommands && !pluginLoader.pluginManifest.contributes;
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

  private _applyPlugin(plugin: IRushPlugin, pluginLoader: PluginLoaderBase): void {
    try {
      const rushSessionForPlugin: RushSessionForPlugin = new RushSessionForPlugin(
        this._rushSession,
        pluginLoader.pluginManifest
      );
      plugin.apply(rushSessionForPlugin, this._rushConfiguration);
      /**
       * rushSessionForPlugin maybe used later, but we don't want to keep it
       * in memory after the plugin is initialized successfully
       */
      this._pluginNameToRushSessionForPlugin.set(pluginLoader.pluginName, rushSessionForPlugin);
    } catch (e) {
      throw new InternalError(`Error applying "${pluginLoader.pluginName}": ${e}`);
    }
  }

  private _setupInitializeContributions(): void {
    for (const pluginLoader of [...this._builtInPluginLoaders, ...this._autoinstallerPluginLoaders]) {
      if (Array.isArray(pluginLoader.pluginManifest.contributes)) {
        const { pluginName } = pluginLoader;
        for (const contribute of pluginLoader.pluginManifest.contributes) {
          switch (contribute) {
            case ContributionPoint.buildCacheProvider: {
              this.hooks.initializeContributionPoints
                .for(ContributionPoint.buildCacheProvider)
                .tapPromise(pluginName, async () => {
                  if (pluginLoader instanceof AutoinstallerPluginLoader) {
                    await this._preparePluginAutoinstallersAsync([pluginLoader]);
                  }
                  this._initializePlugins([pluginLoader], { doNotThrowSamePluginName: true });
                  const rushSessionForPlugin: RushSessionForPlugin | undefined =
                    this._pluginNameToRushSessionForPlugin.get(pluginName);
                  if (rushSessionForPlugin) {
                    // Trigger initialize life cycle for the plugin, because it is lazily loaded
                    await rushSessionForPlugin.hooks.initialize.promise();
                    // Set the rushSession has been initialized
                    rushSessionForPlugin.initialized();
                  }
                  this._pluginNameToRushSessionForPlugin.set(pluginName, undefined);
                });
              break;
            }
            default: {
              // no-default
            }
          }
        }
      }
    }
  }
}
