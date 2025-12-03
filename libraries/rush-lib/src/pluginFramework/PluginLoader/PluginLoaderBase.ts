// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import {
  FileSystem,
  InternalError,
  JsonFile,
  type JsonObject,
  JsonSchema
} from '@rushstack/node-core-library';
import type { ITerminal } from '@rushstack/terminal';

import { CommandLineConfiguration } from '../../api/CommandLineConfiguration';
import type { RushConfiguration } from '../../api/RushConfiguration';
import type { IRushPluginConfigurationBase } from '../../api/RushPluginsConfiguration';
import { RushConstants } from '../../logic/RushConstants';
import type { IRushPlugin } from '../IRushPlugin';
import { RushSdk } from './RushSdk';
import schemaJson from '../../schemas/rush-plugin-manifest.schema.json';

export interface IRushPluginManifest {
  pluginName: string;
  description: string;
  entryPoint?: string;
  optionsSchema?: string;
  associatedCommands?: string[];
  commandLineJsonFilePath?: string;
}

export interface IRushPluginManifestJson {
  plugins: IRushPluginManifest[];
}

export interface IPluginLoaderOptions<TPluginConfiguration extends IRushPluginConfigurationBase> {
  pluginConfiguration: TPluginConfiguration;
  rushConfiguration: RushConfiguration;
  terminal: ITerminal;
}

export abstract class PluginLoaderBase<
  TPluginConfiguration extends IRushPluginConfigurationBase = IRushPluginConfigurationBase
> {
  protected static _jsonSchema: JsonSchema = JsonSchema.fromLoadedObject(schemaJson);

  public readonly packageName: Readonly<string>;
  public readonly pluginName: Readonly<string>;
  protected readonly _rushConfiguration: RushConfiguration;
  protected readonly _terminal: ITerminal;

  protected _manifestCache: Readonly<IRushPluginManifest> | undefined;

  /**
   * The folder that should be used for resolving the plugin's NPM package.
   */
  public abstract readonly packageFolder: string;

  public constructor({
    pluginConfiguration,
    rushConfiguration,
    terminal
  }: IPluginLoaderOptions<TPluginConfiguration>) {
    this.packageName = pluginConfiguration.packageName;
    this.pluginName = pluginConfiguration.pluginName;
    this._rushConfiguration = rushConfiguration;
    this._terminal = terminal;
  }

  public load(): IRushPlugin | undefined {
    const resolvedPluginPath: string | undefined = this._resolvePlugin();
    if (!resolvedPluginPath) {
      return undefined;
    }
    const pluginOptions: JsonObject = this._getPluginOptions();

    RushSdk.ensureInitialized();

    return this._loadAndValidatePluginPackage(resolvedPluginPath, pluginOptions);
  }

  public get pluginManifest(): IRushPluginManifest {
    return this._getRushPluginManifest();
  }

  public getCommandLineConfiguration(): CommandLineConfiguration | undefined {
    const commandLineJsonFilePath: string | undefined = this._getCommandLineJsonFilePath();
    if (!commandLineJsonFilePath) {
      return undefined;
    }
    const commandLineConfiguration: CommandLineConfiguration | undefined =
      CommandLineConfiguration.tryLoadFromFile(commandLineJsonFilePath);
    if (!commandLineConfiguration) {
      return undefined;
    }

    for (const additionalPathFolder of this._getCommandLineAdditionalPathFolders().reverse()) {
      commandLineConfiguration.prependAdditionalPathFolder(additionalPathFolder);
    }

    commandLineConfiguration.shellCommandTokenContext = {
      packageFolder: this.packageFolder
    };
    return commandLineConfiguration;
  }

  protected _getCommandLineAdditionalPathFolders(): string[] {
    return [
      // Example: `@microsoft/rush-lib/node_modules/<packageName>/node_modules/.bin`
      // Example: `common/autoinstaller/plugins/node_modules/<packageName>/node_modules/.bin`
      path.join(this.packageFolder, 'node_modules', '.bin')
    ];
  }

  protected _getCommandLineJsonFilePath(): string | undefined {
    const { commandLineJsonFilePath } = this._getRushPluginManifest();
    if (!commandLineJsonFilePath) {
      return undefined;
    }
    return path.join(this.packageFolder, commandLineJsonFilePath);
  }

  private _loadAndValidatePluginPackage(resolvedPluginPath: string, options?: JsonObject): IRushPlugin {
    type IRushPluginCtor<T = JsonObject> = new (opts: T) => IRushPlugin;
    let pluginPackage: IRushPluginCtor;
    try {
      const loadedPluginPackage: IRushPluginCtor | { default: IRushPluginCtor } = require(resolvedPluginPath);
      pluginPackage = (loadedPluginPackage as { default: IRushPluginCtor }).default || loadedPluginPackage;
    } catch (e) {
      throw new InternalError(`Error loading rush plugin from "${resolvedPluginPath}": ${e}`);
    }

    if (!pluginPackage) {
      throw new InternalError(`Rush plugin loaded from "${resolvedPluginPath}" is null or undefined.`);
    }

    this._terminal.writeVerboseLine(`Loaded rush plugin from "${resolvedPluginPath}"`);

    const plugin: IRushPlugin = new pluginPackage(options);

    if (!plugin.apply || typeof pluginPackage.apply !== 'function') {
      throw new InternalError(
        `Rush plugin must define an "apply" function. The plugin loaded from "${resolvedPluginPath}" ` +
          'either doesn\'t define an "apply" property, or its value isn\'t a function.'
      );
    }

    return plugin;
  }

  private _resolvePlugin(): string | undefined {
    const entryPoint: string | undefined = this._getRushPluginManifest().entryPoint;
    if (!entryPoint) {
      return undefined;
    }
    const packageFolder: string = this.packageFolder;
    const modulePath: string = path.join(packageFolder, entryPoint);
    if (!FileSystem.exists(modulePath)) {
      throw new InternalError(
        `Unable to find entry point "${modulePath}" for rush plugin "${this.pluginName}".`
      );
    }
    return modulePath;
  }

  protected _getPluginOptions(): JsonObject {
    const optionsJsonFilePath: string = this._getPluginOptionsJsonFilePath();
    const optionsSchema: JsonSchema | undefined = this._getRushPluginOptionsSchema();

    let pluginOptions: JsonObject = {};
    try {
      pluginOptions = JsonFile.load(optionsJsonFilePath);
    } catch (e) {
      if (FileSystem.isFileDoesNotExistError(e as Error)) {
        return {};
      }
      throw e;
    }

    if (optionsSchema) {
      optionsSchema.validateObject(pluginOptions, optionsJsonFilePath);
    }

    return pluginOptions;
  }

  protected _getPluginOptionsJsonFilePath(): string {
    return path.join(this._rushConfiguration.rushPluginOptionsFolder, `${this.pluginName}.json`);
  }

  protected _getRushPluginOptionsSchema(): JsonSchema | undefined {
    const optionsSchema: string | undefined = this._getRushPluginManifest().optionsSchema;
    if (!optionsSchema) {
      return undefined;
    }
    const optionsSchemaFilePath: string = path.join(this.packageFolder, optionsSchema);
    return JsonSchema.fromFile(optionsSchemaFilePath);
  }

  private _getRushPluginManifest(): IRushPluginManifest {
    if (!this._manifestCache) {
      const packageName: string = this.packageName;
      const pluginName: string = this.pluginName;

      const manifestPath: string = this._getManifestPath();

      if (!FileSystem.exists(manifestPath)) {
        throw new Error(
          `Manifest for rush plugin package ${packageName} not found.\nPlease run 'rush update' first.`
        );
      }

      const rushPluginManifestJson: IRushPluginManifestJson = JsonFile.loadAndValidate(
        manifestPath,
        PluginLoaderBase._jsonSchema
      );

      const pluginManifest: IRushPluginManifest | undefined = rushPluginManifestJson.plugins.find(
        (item) => item.pluginName === pluginName
      );
      if (!pluginManifest) {
        throw new Error(`${pluginName} is not provided by Rush plugin package "${packageName}"`);
      }

      this._manifestCache = pluginManifest;
    }

    return this._manifestCache;
  }

  protected _getManifestPath(): string {
    return path.join(this.packageFolder, RushConstants.rushPluginManifestFilename);
  }
}
