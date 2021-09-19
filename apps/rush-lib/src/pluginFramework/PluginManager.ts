// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { InternalError, JsonObject, Terminal } from '@rushstack/node-core-library';

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
  options?: JsonObject;
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

    const pluginsAutoinstallerName: string | undefined =
      this._rushConfiguration.rushConfigurationJson.pluginsAutoinstallerName;

    if (!pluginsAutoinstallerName) {
      throw new Error(
        `Rush plugins are installed by autoinstaller, Please setup "pluginsAutoinstallerName" in rush.json`
      );
    }

    const pluginsAutoinstallerFolder: string = new Autoinstaller(
      pluginsAutoinstallerName,
      this._rushConfiguration
    ).folderFullPath;

    for (const rushPluginConfig of rushPluginConfigurations) {
      const resolvedPluginPath: string = this._resolveRemotePlugin(
        rushPluginConfig.plugin,
        pluginsAutoinstallerFolder
      );
      this._initializeResolvedPlugin(resolvedPluginPath, rushPluginConfig);
    }
  }

  private _resolveRemotePlugin(pluginSpecifier: string, pluginsAutoinstallerFolder: string): string {
    try {
      return require.resolve(pluginSpecifier, {
        paths: [pluginsAutoinstallerFolder]
      });
    } catch (e) {
      throw new InternalError(`Resolve plugin ${pluginSpecifier} failed in ${pluginsAutoinstallerFolder}`);
    }
  }

  private _initializeResolvedPlugin(
    resolvedPluginPath: string,
    rushPluginConfig: IRushPluginConfigJson
  ): void {
    const plugin: IRushPlugin = this._loadAndValidatePluginPackage(
      resolvedPluginPath,
      rushPluginConfig.options
    );

    this._applyPlugin(plugin, rushPluginConfig);
  }

  private _loadAndValidatePluginPackage(resolvedPluginPath: string, options?: JsonObject): IRushPlugin {
    type IRushPluginCtor<T = JsonObject> = new (options: T) => IRushPlugin;
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

    const plugin: IRushPlugin = new pluginPackage(options);

    if (!plugin.apply || typeof pluginPackage.apply !== 'function') {
      throw new InternalError(
        `Rush plugin must define an "apply" function. The plugin loaded from "${resolvedPluginPath}" ` +
          'either doesn\'t define an "apply" property, or its value isn\'t a function.'
      );
    }

    return plugin;
  }

  private _applyPlugin(plugin: IRushPlugin, rushPluginConfig: IRushPluginConfigJson): void {
    try {
      plugin.apply(this._rushSession, this._rushConfiguration);
    } catch (e) {
      throw new InternalError(`Error applying "${rushPluginConfig.plugin}": ${e}`);
    }
  }
}
