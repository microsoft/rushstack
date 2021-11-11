// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { FileSystem, JsonFile, JsonObject, JsonSchema, ITerminal } from '@rushstack/node-core-library';
import { RushConfiguration } from '../../api/RushConfiguration';
import { IRushPluginConfiguration } from '../../api/RushPluginsConfiguration';
import { Autoinstaller } from '../../logic/Autoinstaller';
import { RushConstants } from '../../logic/RushConstants';
import { IRushPluginManifest, IRushPluginManifestJson, PluginLoaderBase } from './PluginLoaderBase';

export interface IRemotePluginLoaderOptions {
  pluginConfiguration: IRushPluginConfiguration;
  rushConfiguration: RushConfiguration;
  terminal: ITerminal;
}

/**
 * @beta
 */
export class RemotePluginLoader extends PluginLoaderBase {
  private _autoinstaller: Autoinstaller;

  public constructor({ pluginConfiguration, rushConfiguration, terminal }: IRemotePluginLoaderOptions) {
    super({
      pluginConfiguration,
      rushConfiguration,
      terminal
    });
    this._autoinstaller = new Autoinstaller(pluginConfiguration.autoinstallerName, this._rushConfiguration);
  }

  protected override onGetPackageFolder(): string {
    return path.join(this._autoinstaller.folderFullPath, 'node_modules', this._packageName);
  }

  /**
   * The folder where rush plugins static files are stored.
   * Example: `C:\MyRepo\common\autoinstallers\<autoinstaller_name>\rush-plugins`
   */
  public static getPluginAutoinstallerStorePath(autoinstaller: Autoinstaller): string {
    return path.join(autoinstaller.folderFullPath, 'rush-plugins');
  }

  public update(): void {
    const packageName: string = this._packageName;
    const pluginName: string = this._pluginName;
    const packageFolder: string = this.getPackageFolder();
    const manifestPath: string = path.join(packageFolder, RushConstants.rushPluginManifestFilename);

    // validate
    const manifest: IRushPluginManifestJson = JsonFile.loadAndValidate(
      manifestPath,
      RemotePluginLoader._jsonSchema
    );

    FileSystem.copyFile({
      sourcePath: manifestPath,
      destinationPath: this._getManifestPath()
    });

    const pluginManifest: IRushPluginManifest | undefined = manifest.plugins.find(
      (item) => item.pluginName === pluginName
    );
    if (!pluginManifest) {
      throw new Error(
        `A plugin named "${pluginName}" is not provided by the Rush plugin package "${packageName}"`
      );
    }

    const commandLineJsonFilePath: string | undefined = pluginManifest.commandLineJsonFilePath;
    if (commandLineJsonFilePath) {
      const commandLineJsonFullFilePath: string = path.join(packageFolder, commandLineJsonFilePath);
      if (!FileSystem.exists(commandLineJsonFullFilePath)) {
        this._terminal.writeErrorLine(
          `The Rush plugin "${pluginName}" from "${packageName}" specifies a commandLineJsonFilePath` +
            ` ${commandLineJsonFilePath} that does not exist.`
        );
      }
      FileSystem.copyFile({
        sourcePath: commandLineJsonFullFilePath,
        destinationPath: this._getCommandLineJsonFilePath()
      });
    }
  }

  public get autoinstaller(): Autoinstaller {
    return this._autoinstaller;
  }

  protected override _getCommandLineAdditionalPathFolders(): string[] {
    const additionalPathFolders: string[] = super._getCommandLineAdditionalPathFolders();
    additionalPathFolders.push(
      // Example: `common/autoinstaller/plugins/node_modules/.bin`
      path.join(this._autoinstaller.folderFullPath, 'node_modules', '.bin')
    );
    return additionalPathFolders;
  }

  protected override _getPluginOptions(): JsonObject {
    const optionsJsonFilePath: string = this._getPluginOptionsJsonFilePath();
    const optionsSchema: JsonSchema | undefined = this._getRushPluginOptionsSchema();

    let pluginOptions: JsonObject = {};
    try {
      pluginOptions = JsonFile.load(optionsJsonFilePath);
    } catch (e) {
      if (FileSystem.isFileDoesNotExistError(e as Error)) {
        if (optionsSchema) {
          throw new Error(
            `Plugin options are required by ${this._pluginName} from package ${this._packageName}, please create it at ${optionsJsonFilePath}.`
          );
        } else {
          return {};
        }
      }
      throw e;
    }

    if (optionsSchema) {
      optionsSchema.validateObject(pluginOptions, optionsJsonFilePath);
    }

    return pluginOptions;
  }

  protected override _getManifestPath(): string {
    return path.join(
      RemotePluginLoader.getPluginAutoinstallerStorePath(this._autoinstaller),
      this._packageName,
      RushConstants.rushPluginManifestFilename
    );
  }

  protected override _getCommandLineJsonFilePath(): string {
    return path.join(
      RemotePluginLoader.getPluginAutoinstallerStorePath(this._autoinstaller),
      this._packageName,
      this._pluginName,
      RushConstants.commandLineFilename
    );
  }
}
