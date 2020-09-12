// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { Terminal, InternalError, FileSystem, Import } from '@rushstack/node-core-library';

import { HeftConfiguration } from '../configuration/HeftConfiguration';
import { IHeftPlugin } from './IHeftPlugin';
import { InternalHeftSession } from './InternalHeftSession';
import { HeftSession } from './HeftSession';

// Default plugins
import { TypeScriptPlugin } from '../plugins/TypeScriptPlugin/TypeScriptPlugin';
import { CleanPlugin } from '../plugins/CleanPlugin';
import { CopyStaticAssetsPlugin } from '../plugins/CopyStaticAssetsPlugin';
import { ApiExtractorPlugin } from '../plugins/ApiExtractorPlugin/ApiExtractorPlugin';
import { JestPlugin } from '../plugins/JestPlugin/JestPlugin';
import { BasicConfigureWebpackPlugin } from '../plugins/Webpack/BasicConfigureWebpackPlugin';
import { WebpackPlugin } from '../plugins/Webpack/WebpackPlugin';
import { HeftConfigFiles } from '../utilities/HeftConfigFiles';

export interface IPluginManagerOptions {
  terminal: Terminal;
  heftConfiguration: HeftConfiguration;
  internalHeftSession: InternalHeftSession;
}

export interface IPluginConfigurationJson {
  plugins: {
    plugin: string;
    options?: object;
  }[];
}

export class PluginManager {
  private _terminal: Terminal;
  private _heftConfiguration: HeftConfiguration;
  private _internalHeftSession: InternalHeftSession;
  private _appliedPlugins: IHeftPlugin[] = [];
  private _appliedPluginNames: Set<string> = new Set<string>();

  public constructor(options: IPluginManagerOptions) {
    this._terminal = options.terminal;
    this._heftConfiguration = options.heftConfiguration;
    this._internalHeftSession = options.internalHeftSession;
  }

  public initializeDefaultPlugins(): void {
    this._applyPlugin(new TypeScriptPlugin());
    this._applyPlugin(new CopyStaticAssetsPlugin());
    this._applyPlugin(new CleanPlugin());
    this._applyPlugin(new ApiExtractorPlugin());
    this._applyPlugin(new JestPlugin());
    this._applyPlugin(new BasicConfigureWebpackPlugin());
    this._applyPlugin(new WebpackPlugin());
  }

  public initializePlugin(pluginSpecifier: string, options?: object): void {
    const resolvedPluginPath: string = this._resolvePlugin(pluginSpecifier);
    this._initializeResolvedPlugin(resolvedPluginPath, options);
  }

  public async initializePluginsFromConfigFileAsync(): Promise<void> {
    try {
      const pluginConfigFilePath: string = path.join(
        this._heftConfiguration.projectHeftDataFolder,
        'plugins.json'
      );
      const pluginConfigurationJson: IPluginConfigurationJson = await HeftConfigFiles.pluginConfigFileLoader.loadConfigurationFileAsync(
        pluginConfigFilePath
      );

      for (const pluginSpecifier of pluginConfigurationJson.plugins) {
        this._initializeResolvedPlugin(pluginSpecifier.plugin, pluginSpecifier.options);
      }
    } catch (e) {
      if (!FileSystem.isNotExistError(e)) {
        throw e;
      }
    }
  }

  public afterInitializeAllPlugins(): void {
    for (const appliedPlugin of this._appliedPlugins) {
      this._internalHeftSession.applyPluginHooks(appliedPlugin);
    }
  }

  private _initializeResolvedPlugin(resolvedPluginPath: string, options?: object): void {
    const plugin: IHeftPlugin<object | void> = this._loadAndValidatePluginPackage(resolvedPluginPath);

    if (this._appliedPluginNames.has(plugin.pluginName)) {
      throw new Error(
        `Error applying plugin "${resolvedPluginPath}": A plugin with name "${plugin.pluginName}" has ` +
          'already been applied'
      );
    } else {
      this._applyPlugin(plugin, options);
    }
  }

  private _applyPlugin(plugin: IHeftPlugin<object | void>, options?: object): void {
    try {
      const heftSession: HeftSession = this._internalHeftSession.getSessionForPlugin(plugin);
      plugin.apply(heftSession, this._heftConfiguration, options);
      this._appliedPlugins.push(plugin);
      this._appliedPluginNames.add(plugin.pluginName);
    } catch (e) {
      throw new InternalError(`Error applying "${plugin.pluginName}": ${e}`);
    }
  }

  private _loadAndValidatePluginPackage(resolvedPluginPath: string): IHeftPlugin {
    let pluginPackage: IHeftPlugin;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const loadedPluginPackage: IHeftPlugin | { default: IHeftPlugin } = require(resolvedPluginPath);
      pluginPackage = (loadedPluginPackage as { default: IHeftPlugin }).default || loadedPluginPackage;
    } catch (e) {
      throw new InternalError(`Error loading plugin package: ${e}`);
    }

    this._terminal.writeVerboseLine(`Loaded plugin package from "${resolvedPluginPath}"`);

    if (!pluginPackage) {
      throw new InternalError(`Plugin package loaded from "${resolvedPluginPath}" is null or undefined.`);
    }

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

    return pluginPackage;
  }

  private _resolvePlugin(pluginSpecifier: string): string {
    let resolvedPluginPath: string;

    this._terminal.writeVerboseLine(`Resolving plugin ${pluginSpecifier}`);

    try {
      resolvedPluginPath = Import.resolveModule({
        modulePath: pluginSpecifier,
        baseFolderPath: this._heftConfiguration.buildFolder
      });
    } catch (e) {
      throw new InternalError(`Error resolving specified plugin "${pluginSpecifier}". Resolve error: ${e}`);
    }

    if (!resolvedPluginPath) {
      throw new InternalError(`Error resolving specified plugin "${pluginSpecifier}".`);
    }

    this._terminal.writeVerboseLine(`Resolved plugin path to ${resolvedPluginPath}`);

    return resolvedPluginPath;
  }
}
