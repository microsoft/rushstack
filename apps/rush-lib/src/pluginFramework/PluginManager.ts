// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { InternalError, Terminal } from '@rushstack/node-core-library';
import { IRushPluginConfigJson, RushConfiguration } from '../api/RushConfiguration';
import { Autoinstaller } from '../logic/Autoinstaller';
import AmazonS3BuildCachePlugin from '../plugins/AmazonS3BuildCachePlugin';
import AzureStorageBuildCachePlugin from '../plugins/AzureStorageBuildCachePlugin';
import { IRushPlugin } from './IRushPlugin';
import { RushSession } from './RushSession';

export interface IPluginManagerOptions {
  terminal: Terminal;
  rushConfiguration: RushConfiguration;
  rushSession: RushSession;
}

export interface IPluginConfig {
  /**
   * plugin specifier, e.g. @company/plugin-name
   */
  plugin: string;
  /**
   * Semver of the plugin. target version will be installed
   */
  pluginVersion: string;
  options?: object;
}

export class PluginManager {
  private _terminal: Terminal;
  private _rushConfiguration: RushConfiguration;
  private _rushSession: RushSession;
  private _appliedPlugins: IRushPlugin[] = [];
  private _appliedPluginNames: Set<string> = new Set<string>();

  public constructor(options: IPluginManagerOptions) {
    this._terminal = options.terminal;
    this._rushConfiguration = options.rushConfiguration;
    this._rushSession = options.rushSession;
  }

  public get rushPluginConfigurations(): IRushPluginConfigJson[] {
    return this._rushConfiguration.rushConfigurationJson.rushPlugins || [];
  }

  public initializeDefaultPlugins(): void {
    this._applyPlugin(new AzureStorageBuildCachePlugin());
    this._applyPlugin(new AmazonS3BuildCachePlugin());
  }

  public async initializePluginsFromConfigFileAsync(): Promise<void> {
    const rushPluginConfigurations: IRushPluginConfigJson[] = this.rushPluginConfigurations;
    if (rushPluginConfigurations.length === 0) {
      return;
    }

    for (const rushPluginConfig of rushPluginConfigurations) {
      const resolvedPluginPath: string = this._resolveRemotePlugin(rushPluginConfig.plugin);
      this._initializeResolvedPlugin(resolvedPluginPath, rushPluginConfig.options);
    }
  }

  private _resolveRemotePlugin(pluginSpecifier: string): string {
    const commonAutoinstallerName: string | undefined =
      this._rushConfiguration.rushConfigurationJson.commonAutoinstallerName;
    if (!commonAutoinstallerName) {
      throw new Error(
        `Resolve plugin ${pluginSpecifier} failed, please setup "commonAutoinstallerName" in rush.json`
      );
    }
    const commonAutoinstallerFolder: string = new Autoinstaller(
      commonAutoinstallerName,
      this._rushConfiguration
    ).folderFullPath;
    try {
      return require.resolve(pluginSpecifier, {
        paths: [commonAutoinstallerFolder]
      });
    } catch (e) {
      throw new InternalError(`Resolve plugin ${pluginSpecifier} failed in ${commonAutoinstallerFolder}`);
    }
  }

  private _initializeResolvedPlugin(resolvedPluginPath: string, options?: object): void {
    const plugin: IRushPlugin<object | void> = this._loadAndValidatePluginPackage(
      resolvedPluginPath,
      options
    );

    if (this._appliedPluginNames.has(plugin.pluginName)) {
      throw new Error(
        `Error applying plugin "${resolvedPluginPath}": A plugin with name "${plugin.pluginName}" has ` +
          'already been applied'
      );
    } else {
      this._applyPlugin(plugin, options);
    }
  }

  private _loadAndValidatePluginPackage(resolvedPluginPath: string, options?: object): IRushPlugin {
    let pluginPackage: IRushPlugin;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const loadedPluginPackage: IRushPlugin | { default: IRushPlugin } = require(resolvedPluginPath);
      pluginPackage = (loadedPluginPackage as { default: IRushPlugin }).default || loadedPluginPackage;
    } catch (e) {
      throw new InternalError(`Error loading plugin package from "${resolvedPluginPath}": ${e}`);
    }

    if (!pluginPackage) {
      throw new InternalError(`Plugin package loaded from "${resolvedPluginPath}" is null or undefined.`);
    }

    this._terminal.writeVerboseLine(`Loaded plugin package from "${resolvedPluginPath}"`);

    if (!pluginPackage.apply || typeof pluginPackage.apply !== 'function') {
      throw new InternalError(
        `Plugin packages must define an "apply" function. The plugin loaded from "${resolvedPluginPath}" ` +
          'either doesn\'t define an "apply" property, or its value isn\'t a function.'
      );
    }

    if (!pluginPackage.pluginName || typeof pluginPackage.pluginName !== 'string') {
      throw new InternalError(
        `Plugin packages must define a "pluginName" property. The plugin loaded from "${resolvedPluginPath}" ` +
          'either doesn\'t define a "pluginName" property, or its value isn\'t a string.'
      );
    }

    if (options && pluginPackage.optionsSchema) {
      try {
        pluginPackage.optionsSchema.validateObject(options, 'rush.json');
      } catch (e) {
        throw new Error(
          `Provided options for plugin "${pluginPackage.pluginName}" did not match the provided plugin schema.\n${e}`
        );
      }
    }

    return pluginPackage;
  }

  private _applyPlugin(plugin: IRushPlugin<object | void>, options?: object): void {
    try {
      plugin.apply(this._rushSession, this._rushConfiguration, options);
      this._appliedPlugins.push(plugin);
      this._appliedPluginNames.add(plugin.pluginName);
    } catch (e) {
      throw new InternalError(`Error applying "${plugin.pluginName}": ${e}`);
    }
  }
}
