// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { InternalError, Terminal } from '@rushstack/node-core-library';

import { IRushPluginConfigJson, RushConfiguration } from '../api/RushConfiguration';
import { Autoinstaller } from '../logic/Autoinstaller';
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

  public constructor(options: IPluginManagerOptions) {
    this._terminal = options.terminal;
    this._rushConfiguration = options.rushConfiguration;
    this._rushSession = options.rushSession;
  }

  public get rushPluginConfigurations(): IRushPluginConfigJson[] {
    return this._rushConfiguration.rushConfigurationJson.rushPlugins || [];
  }

  public initializeDefaultPlugins(): void {}

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

    this._applyPlugin(plugin, options);
  }

  private _loadAndValidatePluginPackage(resolvedPluginPath: string, options?: object): IRushPlugin {
    type IRushPluginCtor = new () => IRushPlugin<object | void>;
    let pluginPackage: IRushPluginCtor;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const loadedPluginPackage: IRushPluginCtor | { default: IRushPluginCtor } = require(resolvedPluginPath);
      pluginPackage = (loadedPluginPackage as { default: IRushPluginCtor }).default || loadedPluginPackage;
    } catch (e) {
      throw new InternalError(`Error loading plugin package from "${resolvedPluginPath}": ${e}`);
    }

    if (!pluginPackage) {
      throw new InternalError(`Plugin package loaded from "${resolvedPluginPath}" is null or undefined.`);
    }

    this._terminal.writeVerboseLine(`Loaded plugin package from "${resolvedPluginPath}"`);

    const plugin: IRushPlugin<object | void> = new pluginPackage();

    if (!plugin.apply || typeof pluginPackage.apply !== 'function') {
      throw new InternalError(
        `Plugin packages must define an "apply" function. The plugin loaded from "${resolvedPluginPath}" ` +
          'either doesn\'t define an "apply" property, or its value isn\'t a function.'
      );
    }

    if (!plugin.pluginName || typeof plugin.pluginName !== 'string') {
      throw new InternalError(
        `Plugin packages must define a "pluginName" property. The plugin loaded from "${resolvedPluginPath}" ` +
          'either doesn\'t define a "pluginName" property, or its value isn\'t a string.'
      );
    }

    if (options && plugin.optionsSchema) {
      try {
        plugin.optionsSchema.validateObject(options, 'rush.json');
      } catch (e) {
        throw new Error(
          `Provided options for plugin "${plugin.pluginName}" did not match the provided plugin schema.\n${e}`
        );
      }
    }

    return plugin;
  }

  private _applyPlugin(plugin: IRushPlugin<object | void>, options?: object): void {
    try {
      plugin.apply(this._rushSession, this._rushConfiguration, options);
    } catch (e) {
      throw new InternalError(`Error applying "${plugin.pluginName}": ${e}`);
    }
  }
}
