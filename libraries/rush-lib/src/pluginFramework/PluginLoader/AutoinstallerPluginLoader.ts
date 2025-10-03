// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import {
  FileSystem,
  JsonFile,
  PosixModeBits,
  type JsonObject,
  type JsonSchema
} from '@rushstack/node-core-library';

import type { IRushPluginConfiguration } from '../../api/RushPluginsConfiguration';
import { Autoinstaller } from '../../logic/Autoinstaller';
import { RushConstants } from '../../logic/RushConstants';
import {
  type IPluginLoaderOptions,
  type IRushPluginManifest,
  type IRushPluginManifestJson,
  PluginLoaderBase
} from './PluginLoaderBase';
import type { RushGlobalFolder } from '../../api/RushGlobalFolder';

interface IAutoinstallerPluginLoaderOptions extends IPluginLoaderOptions<IRushPluginConfiguration> {
  restrictConsoleOutput: boolean;
  rushGlobalFolder: RushGlobalFolder;
}

/**
 * @beta
 */
export class AutoinstallerPluginLoader extends PluginLoaderBase<IRushPluginConfiguration> {
  public readonly packageFolder: string;

  public readonly autoinstaller: Autoinstaller;

  public constructor(options: IAutoinstallerPluginLoaderOptions) {
    super(options);
    this.autoinstaller = new Autoinstaller({
      autoinstallerName: options.pluginConfiguration.autoinstallerName,
      rushConfiguration: this._rushConfiguration,
      restrictConsoleOutput: options.restrictConsoleOutput,
      rushGlobalFolder: options.rushGlobalFolder
    });

    this.packageFolder = path.join(this.autoinstaller.folderFullPath, 'node_modules', this.packageName);
  }

  /**
   * The folder where rush plugins static files are stored.
   * Example: `C:\MyRepo\common\autoinstallers\<autoinstaller_name>\rush-plugins`
   */
  public static getPluginAutoinstallerStorePath(autoinstaller: Autoinstaller): string {
    return path.join(autoinstaller.folderFullPath, 'rush-plugins');
  }

  public update(): void {
    const packageName: string = this.packageName;
    const pluginName: string = this.pluginName;
    const packageFolder: string = this.packageFolder;
    const manifestPath: string = path.join(packageFolder, RushConstants.rushPluginManifestFilename);

    // validate
    const manifest: IRushPluginManifestJson = JsonFile.loadAndValidate(
      manifestPath,
      AutoinstallerPluginLoader._jsonSchema
    );

    const destinationManifestPath: string = this._getManifestPath();
    FileSystem.copyFile({
      sourcePath: manifestPath,
      destinationPath: destinationManifestPath
    });
    // Make permission consistent since it will be committed to Git
    FileSystem.changePosixModeBits(
      destinationManifestPath,
      // eslint-disable-next-line no-bitwise
      PosixModeBits.AllRead | PosixModeBits.UserWrite
    );

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
      const destinationCommandLineJsonFilePath: string = this._getCommandLineJsonFilePath();
      FileSystem.copyFile({
        sourcePath: commandLineJsonFullFilePath,
        destinationPath: destinationCommandLineJsonFilePath
      });
      // Make permission consistent since it will be committed to Git
      FileSystem.changePosixModeBits(
        destinationCommandLineJsonFilePath,
        // eslint-disable-next-line no-bitwise
        PosixModeBits.AllRead | PosixModeBits.UserWrite
      );
    }
  }

  protected override _getCommandLineAdditionalPathFolders(): string[] {
    const additionalPathFolders: string[] = super._getCommandLineAdditionalPathFolders();
    additionalPathFolders.push(
      // Example: `common/autoinstaller/plugins/node_modules/.bin`
      path.join(this.autoinstaller.folderFullPath, 'node_modules', '.bin')
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
            `Plugin options are required by ${this.pluginName} from package ${this.packageName}, please create it at ${optionsJsonFilePath}.`
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
      AutoinstallerPluginLoader.getPluginAutoinstallerStorePath(this.autoinstaller),
      this.packageName,
      RushConstants.rushPluginManifestFilename
    );
  }

  protected override _getCommandLineJsonFilePath(): string {
    return path.join(
      AutoinstallerPluginLoader.getPluginAutoinstallerStorePath(this.autoinstaller),
      this.packageName,
      this.pluginName,
      RushConstants.commandLineFilename
    );
  }
}
