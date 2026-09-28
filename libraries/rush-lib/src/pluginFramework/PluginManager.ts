// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem, Import, InternalError } from '@rushstack/node-core-library';
import type { ITerminal } from '@rushstack/terminal';

import type { CommandLineConfiguration } from '../api/CommandLineConfiguration';
import type { RushConfiguration } from '../api/RushConfiguration';
import { BuiltInPluginLoader, type IBuiltInPluginConfiguration } from './PluginLoader/BuiltInPluginLoader';
import type { IRushPlugin } from './IRushPlugin';
import { AutoinstallerPluginLoader } from './PluginLoader/AutoinstallerPluginLoader';
import { _createRushSessionForPlugin, type RushSession } from './RushSession';
import type { PluginLoaderBase, IRushPluginManifest } from './PluginLoader/PluginLoaderBase';
import { Rush } from '../api/Rush';
import type { RushGlobalFolder } from '../api/RushGlobalFolder';

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
  readonly #terminal: ITerminal;
  readonly #rushConfiguration: RushConfiguration;
  readonly #rushSession: RushSession;
  readonly #restrictConsoleOutput: boolean;
  readonly #builtInPluginLoaders: BuiltInPluginLoader[];
  readonly #autoinstallerPluginLoaders: AutoinstallerPluginLoader[];
  readonly #installedAutoinstallerNames: Set<string>;
  readonly #loadedPluginNames: Set<string> = new Set<string>();
  readonly #rushGlobalFolder: RushGlobalFolder;

  #error: Error | undefined;

  public constructor(options: IPluginManagerOptions) {
    this.#terminal = options.terminal;
    this.#rushConfiguration = options.rushConfiguration;
    this.#rushSession = options.rushSession;
    this.#restrictConsoleOutput = options.restrictConsoleOutput;
    this.#rushGlobalFolder = options.rushGlobalFolder;

    this.#installedAutoinstallerNames = new Set<string>();

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

    this.#builtInPluginLoaders = builtInPluginConfigurations.map((pluginConfiguration) => {
      return new BuiltInPluginLoader({
        pluginConfiguration,
        rushConfiguration: this.#rushConfiguration,
        terminal: this.#terminal
      });
    });

    this.#autoinstallerPluginLoaders = (
      this.#rushConfiguration?._rushPluginsConfiguration.configuration.plugins ?? []
    ).map((pluginConfiguration) => {
      return new AutoinstallerPluginLoader({
        pluginConfiguration,
        rushConfiguration: this.#rushConfiguration,
        terminal: this.#terminal,
        restrictConsoleOutput: this.#restrictConsoleOutput,
        rushGlobalFolder: this.#rushGlobalFolder
      });
    });
  }

  /**
   * If an error occurs while attempting to load plugins, it will be saved in this property.
   * Rush will attempt to continue and will report the error later by `BaseRushAction._throwPluginErrorIfNeed()`
   * (unless we are invoking a command that is used to fix plugin problems).
   */
  public get error(): Error | undefined {
    return this.#error;
  }

  public get loadedPluginNames(): ReadonlySet<string> {
    return this.#loadedPluginNames;
  }

  /** The `pluginName` of every plugin configured in rush-plugins.json, whether or not it has been loaded. */
  public get configuredPluginNames(): ReadonlySet<string> {
    return new Set(this.#autoinstallerPluginLoaders.map((pluginLoader) => pluginLoader.pluginName));
  }

  public async updateAsync(): Promise<void> {
    await this._preparePluginAutoinstallersAsync(this.#autoinstallerPluginLoaders);
    const preparedAutoinstallerNames: Set<string> = new Set<string>();
    for (const { autoinstaller } of this.#autoinstallerPluginLoaders) {
      const storePath: string = AutoinstallerPluginLoader.getPluginAutoinstallerStorePath(autoinstaller);
      if (!preparedAutoinstallerNames.has(autoinstaller.name)) {
        FileSystem.ensureEmptyFolder(storePath);
        preparedAutoinstallerNames.add(autoinstaller.name);
      }
    }
    for (const pluginLoader of this.#autoinstallerPluginLoaders) {
      pluginLoader.update();
    }
  }

  public async reinitializeAllPluginsForCommandAsync(commandName: string): Promise<void> {
    this.#error = undefined;
    await this.tryInitializeUnassociatedPluginsAsync();
    await this.tryInitializeAssociatedCommandPluginsAsync(commandName);
  }

  public async _preparePluginAutoinstallersAsync(pluginLoaders: AutoinstallerPluginLoader[]): Promise<void> {
    for (const { autoinstaller } of pluginLoaders) {
      if (!this.#installedAutoinstallerNames.has(autoinstaller.name)) {
        await autoinstaller.prepareAsync();
        this.#installedAutoinstallerNames.add(autoinstaller.name);
      }
    }
  }

  public async tryInitializeUnassociatedPluginsAsync(): Promise<void> {
    try {
      const autoinstallerPluginLoaders: AutoinstallerPluginLoader[] = this.#getUnassociatedPluginLoaders(
        this.#autoinstallerPluginLoaders
      );
      await this._preparePluginAutoinstallersAsync(autoinstallerPluginLoaders);
      const builtInPluginLoaders: BuiltInPluginLoader[] = this.#getUnassociatedPluginLoaders(
        this.#builtInPluginLoaders
      );
      this.#initializePlugins([...builtInPluginLoaders, ...autoinstallerPluginLoaders]);
    } catch (e) {
      this.#error = e as Error;
    }
  }

  public async tryInitializeAssociatedCommandPluginsAsync(commandName: string): Promise<void> {
    try {
      const autoinstallerPluginLoaders: AutoinstallerPluginLoader[] = this.#getPluginLoadersForCommand(
        commandName,
        this.#autoinstallerPluginLoaders
      );
      await this._preparePluginAutoinstallersAsync(autoinstallerPluginLoaders);
      const builtInPluginLoaders: BuiltInPluginLoader[] = this.#getPluginLoadersForCommand(
        commandName,
        this.#builtInPluginLoaders
      );
      this.#initializePlugins([...builtInPluginLoaders, ...autoinstallerPluginLoaders]);
    } catch (e) {
      this.#error = e as Error;
    }
  }

  public tryGetCustomCommandLineConfigurationInfos(): ICustomCommandLineConfigurationInfo[] {
    const commandLineConfigurationInfos: ICustomCommandLineConfigurationInfo[] = [];
    for (const pluginLoader of this.#autoinstallerPluginLoaders) {
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

  /**
   * Explains why configured autoinstaller plugins prevent a long-lived engine from serving the specified
   * phased command.
   *
   * @remarks
   * A plugin is compatible with a long-lived engine if its manifest sets `daemonCompatible` or its name is in
   * `compatiblePluginNames`. Any other plugin is inert for the command only if Rush will neither initialize it
   * (it is associated with specific commands, none of which is this command) nor use its command-line.json to
   * define the command, a phase of the command, or a parameter associated with either. A manifest or
   * command-line file that cannot be read is reported rather than assumed to be compatible or inert.
   *
   * @returns An empty array if every configured autoinstaller plugin is compatible with, or inert for, the command.
   */
  public getPluginsIncompatibleWithEngine(
    commandName: string,
    phaseNames: ReadonlySet<string>,
    compatiblePluginNames: ReadonlySet<string>
  ): ReadonlyArray<string> {
    const reasons: string[] = [];
    for (const pluginLoader of this.#autoinstallerPluginLoaders) {
      const pluginLabel: string = `"${pluginLoader.pluginName}" (${pluginLoader.packageName})`;
      let manifest: IRushPluginManifest;
      try {
        manifest = pluginLoader.pluginManifest;
      } catch (error) {
        reasons.push(`${pluginLabel}: its manifest could not be read: ${(error as Error).message}`);
        continue;
      }

      let commandLineConfiguration: CommandLineConfiguration | undefined;
      try {
        commandLineConfiguration = pluginLoader.getCommandLineConfiguration();
      } catch (error) {
        reasons.push(`${pluginLabel}: its command-line.json could not be read: ${(error as Error).message}`);
        continue;
      }
      if (manifest.daemonCompatible || compatiblePluginNames.has(pluginLoader.pluginName)) {
        continue;
      }

      const { associatedCommands } = manifest;
      if (!associatedCommands) {
        reasons.push(`${pluginLabel} is initialized for every command`);
      } else if (associatedCommands.includes(commandName)) {
        reasons.push(`${pluginLabel} is associated with "${commandName}"`);
      }
      if (!commandLineConfiguration) {
        continue;
      }
      if (commandLineConfiguration.commands.has(commandName)) {
        reasons.push(`${pluginLabel} defines the "${commandName}" command`);
      }
      for (const phaseName of commandLineConfiguration.phases.keys()) {
        if (phaseNames.has(phaseName)) {
          reasons.push(`${pluginLabel} defines the "${phaseName}" phase`);
        }
      }
      for (const parameter of commandLineConfiguration.parameters) {
        const { longName, associatedPhases } = parameter;
        if (parameter.associatedCommands?.includes(commandName)) {
          reasons.push(`${pluginLabel} associates "${longName}" with "${commandName}"`);
        }
        for (const phaseName of associatedPhases ?? []) {
          if (phaseNames.has(phaseName)) {
            reasons.push(`${pluginLabel} associates "${longName}" with the "${phaseName}" phase`);
          }
        }
      }
    }
    return reasons;
  }

  #initializePlugins(pluginLoaders: PluginLoaderBase[]): void {
    for (const pluginLoader of pluginLoaders) {
      const pluginName: string = pluginLoader.pluginName;
      if (this.#loadedPluginNames.has(pluginName)) {
        throw new Error(`Error applying plugin: A plugin with name "${pluginName}" has already been applied`);
      }
      const plugin: IRushPlugin | undefined = pluginLoader.load();
      this.#loadedPluginNames.add(pluginName);
      if (plugin) {
        this.#applyPlugin(plugin, pluginLoader);
      }
    }
  }

  #getUnassociatedPluginLoaders<T extends AutoinstallerPluginLoader | BuiltInPluginLoader>(
    pluginLoaders: T[]
  ): T[] {
    return pluginLoaders.filter((pluginLoader) => {
      return !pluginLoader.pluginManifest.associatedCommands;
    });
  }

  #getPluginLoadersForCommand<T extends AutoinstallerPluginLoader | BuiltInPluginLoader>(
    commandName: string,
    pluginLoaders: T[]
  ): T[] {
    return pluginLoaders.filter((pluginLoader) => {
      return pluginLoader.pluginManifest.associatedCommands?.includes(commandName);
    });
  }

  #applyPlugin(plugin: IRushPlugin, pluginLoader: PluginLoaderBase): void {
    const { packageName, pluginName } = pluginLoader;
    try {
      const pluginSession: RushSession = _createRushSessionForPlugin(this.#rushSession, () => ({
        packageName,
        packageVersion: pluginLoader.packageVersion,
        component: pluginName
      }));
      plugin.apply(pluginSession, this.#rushConfiguration);
    } catch (e) {
      throw new InternalError(`Error applying "${pluginName}": ${e}`);
    }
  }
}
