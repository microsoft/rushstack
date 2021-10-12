// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import {
  FileSystem,
  Import,
  InternalError,
  JsonFile,
  JsonObject,
  JsonSchema,
  ITerminal
} from '@rushstack/node-core-library';
import { RushConfiguration } from '../api/RushConfiguration';
import { IRushPluginConfiguration } from '../api/RushPluginsConfiguration';
import { Autoinstaller } from '../logic/Autoinstaller';
import { RushConstants } from '../logic/RushConstants';
import { IRushPlugin } from './IRushPlugin';
import { CommandLineConfiguration } from '../api/CommandLineConfiguration';

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

export interface IPluginLoaderOptions {
  pluginConfiguration: IRushPluginConfiguration;
  rushConfiguration: RushConfiguration;
  terminal: ITerminal;
}

/**
 * @beta
 */
export class PluginLoader {
  private static _jsonSchema: JsonSchema = JsonSchema.fromFile(
    path.join(__dirname, '../schemas/rush-plugin-manifest.schema.json')
  );

  private _pluginConfiguration: IRushPluginConfiguration;
  private _rushConfiguration: RushConfiguration;
  private _terminal: ITerminal;
  private _autoinstaller: Autoinstaller;
  private _manifestCache!: IRushPluginManifest;

  public constructor({ pluginConfiguration, rushConfiguration, terminal }: IPluginLoaderOptions) {
    this._pluginConfiguration = pluginConfiguration;
    this._rushConfiguration = rushConfiguration;
    this._terminal = terminal;
    this._autoinstaller = new Autoinstaller(
      this._pluginConfiguration.autoinstallerName,
      this._rushConfiguration
    );
  }

  public update(): void {
    const { packageName, pluginName } = this._pluginConfiguration;
    const packageFolder: string = this.packageFolder;
    const manifestPath: string = path.join(packageFolder, RushConstants.rushPluginManifestFilename);

    // validate
    const manifest: IRushPluginManifestJson = JsonFile.loadAndValidate(
      manifestPath,
      PluginLoader._jsonSchema
    );

    FileSystem.copyFile({
      sourcePath: manifestPath,
      destinationPath: this._getManifestPath()
    });

    const pluginManifest: IRushPluginManifest | undefined = manifest.plugins.find(
      (item) => item.pluginName === pluginName
    );
    if (!pluginManifest) {
      throw new Error(`${pluginName} does not provided by rush plugin package ${packageName}`);
    }

    const commandLineJsonFilePath: string | undefined = pluginManifest.commandLineJsonFilePath;
    if (commandLineJsonFilePath) {
      const commandLineJsonFullFilePath: string = path.join(packageFolder, commandLineJsonFilePath);
      if (!FileSystem.exists(commandLineJsonFullFilePath)) {
        this._terminal.writeErrorLine(
          `Rush plugin ${pluginName} from ${packageName} specifies commandLineJsonFilePath ${commandLineJsonFilePath} does not exist.`
        );
      }
      FileSystem.copyFile({
        sourcePath: commandLineJsonFullFilePath,
        destinationPath: this._getCommandLineJsonFilePath()
      });
    }
  }

  public load(): IRushPlugin | undefined {
    const resolvedPluginPath: string | undefined = this._resolvePlugin();
    if (!resolvedPluginPath) {
      return undefined;
    }
    const pluginOptions: JsonObject = this._getPluginOptions();

    return this._loadAndValidatePluginPackage(resolvedPluginPath, pluginOptions);
  }

  public getCommandLineConfiguration(): CommandLineConfiguration | undefined {
    const commandLineJsonFilePath: string = this._getCommandLineJsonFilePath();
    if (!FileSystem.exists(commandLineJsonFilePath)) {
      return undefined;
    }
    const commandLineConfiguration: CommandLineConfiguration =
      CommandLineConfiguration.loadFromFileOrDefault(commandLineJsonFilePath);
    commandLineConfiguration.prependAdditionalPathFolder(
      // Example: `common/autoinstaller/plugins/node_modules/.bin`
      path.join(this.autoinstaller.folderFullPath, 'node_modules', '.bin')
    );
    commandLineConfiguration.shellCommandTokenContext = {
      packageFolder: this.packageFolder
    };
    return commandLineConfiguration;
  }

  public get configuration(): IRushPluginConfiguration {
    return this._pluginConfiguration;
  }

  public get autoinstaller(): Autoinstaller {
    return this._autoinstaller;
  }

  public get pluginManifest(): IRushPluginManifest {
    return this._getRushPluginManifest();
  }

  public get packageFolder(): string {
    return path.join(
      this._autoinstaller.folderFullPath,
      'node_modules',
      this._pluginConfiguration.packageName
    );
  }

  private _getRushPluginManifest(): IRushPluginManifest {
    if (!this._manifestCache) {
      const { packageName, pluginName } = this._pluginConfiguration;

      const manifestPath: string = this._getManifestPath();

      if (!FileSystem.exists(manifestPath)) {
        throw new Error(
          `Manifest for rush plugin package ${packageName} not found.\nPlease run 'rush update' first.`
        );
      }

      const rushPluginManifestJson: IRushPluginManifestJson = JsonFile.loadAndValidate(
        manifestPath,
        PluginLoader._jsonSchema
      );

      const pluginManifest: IRushPluginManifest | undefined = rushPluginManifestJson.plugins.find(
        (item) => item.pluginName === pluginName
      );
      if (!pluginManifest) {
        throw new Error(`${pluginName} does not provided by rush plugin package ${packageName}`);
      }

      this._manifestCache = pluginManifest;
    }

    return this._manifestCache;
  }

  private _getRushPluginOptionsSchema(): JsonSchema | undefined {
    const optionsSchema: string | undefined = this._getRushPluginManifest().optionsSchema;
    if (!optionsSchema) {
      return undefined;
    }
    const optionsSchemaFilePath: string = path.join(this.packageFolder, optionsSchema);
    return JsonSchema.fromFile(optionsSchemaFilePath);
  }

  private _resolvePlugin(): string | undefined {
    const entryPoint: string | undefined = this._getRushPluginManifest().entryPoint;
    if (!entryPoint) {
      return undefined;
    }
    // ensure module can be found installed
    const packageFolder: string = Import.resolvePackage({
      baseFolderPath: this.autoinstaller.folderFullPath,
      packageName: this._pluginConfiguration.packageName
    });
    const modulePath: string = path.join(packageFolder, entryPoint);
    return modulePath;
  }

  private _loadAndValidatePluginPackage(resolvedPluginPath: string, options?: JsonObject): IRushPlugin {
    type IRushPluginCtor<T = JsonObject> = new (options: T) => IRushPlugin;
    let pluginPackage: IRushPluginCtor;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
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

  private _getPluginOptions(): JsonObject {
    const optionsJsonFilePath: string | undefined = this._pluginConfiguration.optionsJsonFilePath;
    const optionsSchema: JsonSchema | undefined = this._getRushPluginOptionsSchema();

    if (!optionsJsonFilePath) {
      if (!optionsSchema) {
        return {};
      } else {
        throw new Error(
          `optionsJsonFilePath is required for rush plugin ${this._pluginConfiguration.pluginName} from package ${this._pluginConfiguration.packageName}, please check your rush-plugins.json.`
        );
      }
    }

    const resolvedOptionsJsonFilePath: string = path.join(
      this._rushConfiguration.rushPluginOptionsFolder,
      optionsJsonFilePath
    );

    if (!FileSystem.exists(resolvedOptionsJsonFilePath)) {
      throw new Error(`optionsJsonFile does not exist at ${resolvedOptionsJsonFilePath}`);
    }

    if (optionsSchema) {
      return JsonFile.loadAndValidate(resolvedOptionsJsonFilePath, optionsSchema);
    } else {
      return JsonFile.load(resolvedOptionsJsonFilePath);
    }
  }

  private _getPluginStorePath(): string {
    return path.join(
      this._rushConfiguration.rushPluginManifestsFolder,
      this._pluginConfiguration.packageName,
      this.autoinstaller.name
    );
  }

  private _getManifestPath(): string {
    return path.join(this._getPluginStorePath(), RushConstants.rushPluginManifestFilename);
  }

  private _getCommandLineJsonFilePath(): string {
    return path.join(
      this._getPluginStorePath(),
      this._pluginConfiguration.pluginName,
      RushConstants.commandLineFilename
    );
  }
}
