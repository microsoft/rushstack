// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { Terminal, InternalError, JsonFile, FileSystem, JsonSchema } from '@rushstack/node-core-library';
import * as resolve from 'resolve';

import { HeftConfiguration } from '../configuration/HeftConfiguration';
import { IHeftPlugin } from './IHeftPlugin';
import { HeftSession } from './HeftSession';

// Default plugins
import { TypeScriptPlugin } from '../plugins/TypeScriptPlugin/TypeScriptPlugin';
import { RushJsonConfigurationFilesPlugin } from '../plugins/JsonConfigurationLoaders/RushJsonConfigurationFilesPlugin';
import { ProjectJsonConfigurationFilesPlugin } from '../plugins/JsonConfigurationLoaders/ProjectJsonConfigurationFilesPlugin';
import { CleanPlugin } from '../plugins/CleanPlugin';
import { CopyStaticAssetsPlugin } from '../plugins/CopyStaticAssetsPlugin';
import { PackageJsonConfigurationPlugin } from '../plugins/PackageJsonConfigurationPlugin';
import { ApiExtractorPlugin } from '../plugins/ApiExtractorPlugin/ApiExtractorPlugin';
import { JestPlugin } from '../plugins/JestPlugin/JestPlugin';
import { BasicConfigureWebpackPlugin } from '../plugins/Webpack/BasicConfigureWebpackPlugin';
import { WebpackPlugin } from '../plugins/Webpack/WebpackPlugin';

export interface IPluginManagerOptions {
  terminal: Terminal;
  heftConfiguration: HeftConfiguration;
  heftSession: HeftSession;
}

interface IPluginConfigurationJson {
  plugins: {
    plugin: string;
    options?: object;
  }[];
}

export class PluginManager {
  private _terminal: Terminal;
  private _heftConfiguration: HeftConfiguration;
  private _heftSession: HeftSession;

  public constructor(options: IPluginManagerOptions) {
    this._terminal = options.terminal;
    this._heftConfiguration = options.heftConfiguration;
    this._heftSession = options.heftSession;
  }

  public initializeDefaultPlugins(): void {
    this._applyPlugin(new TypeScriptPlugin());
    this._applyPlugin(new RushJsonConfigurationFilesPlugin());
    this._applyPlugin(new ProjectJsonConfigurationFilesPlugin());
    this._applyPlugin(new CopyStaticAssetsPlugin());
    this._applyPlugin(new CleanPlugin());
    this._applyPlugin(new PackageJsonConfigurationPlugin());
    this._applyPlugin(new ApiExtractorPlugin());
    this._applyPlugin(new JestPlugin());
    this._applyPlugin(new BasicConfigureWebpackPlugin());
    this._applyPlugin(new WebpackPlugin());
  }

  public initializePlugin(pluginSpecifier: string, options?: object): void {
    const resolvedPluginPath: string = this._resolvePlugin(pluginSpecifier);
    const pluginPackage: IHeftPlugin<object | void> = this._loadAndValidatePluginPackage(resolvedPluginPath);
    this._applyPlugin(pluginPackage, options);
  }

  public initializePluginsFromConfigFile(): void {
    try {
      const pluginConfigFilePath: string = path.join(
        this._heftConfiguration.projectHeftDataFolder,
        'plugins.json'
      );
      const pluginConfigurationJson: IPluginConfigurationJson = JsonFile.loadAndValidate(
        pluginConfigFilePath,
        JsonSchema.fromFile(path.join(__dirname, '..', 'schemas', 'plugins.schema.json'))
      );

      for (const pluginSpecifier of pluginConfigurationJson.plugins) {
        this.initializePlugin(pluginSpecifier.plugin, pluginSpecifier.options);
      }
    } catch (e) {
      if (!FileSystem.isNotExistError(e)) {
        throw e;
      }
    }
  }

  private _applyPlugin(pluginPackage: IHeftPlugin<object | void>, options?: object): void {
    try {
      // Todo: Use the plugin displayName in its logging.
      pluginPackage.apply(this._heftSession, this._heftConfiguration, options);
    } catch (e) {
      throw new InternalError(`Error applying "${pluginPackage.displayName}": ${e}`);
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

    if (!pluginPackage.displayName || typeof pluginPackage.displayName !== 'string') {
      throw new InternalError(
        `Plugin packages must define a "displayName" property. The plugin loaded from "${resolvedPluginPath}" ` +
          'either doesn\'t define a "displayName" property, or its value isn\'t a string.'
      );
    }

    return pluginPackage;
  }

  private _resolvePlugin(pluginSpecifier: string): string {
    let resolvedPluginPath: string;

    this._terminal.writeVerboseLine(`Resolving plugin ${pluginSpecifier}`);

    try {
      resolvedPluginPath = resolve.sync(pluginSpecifier, {
        basedir: this._heftConfiguration.buildFolder
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
