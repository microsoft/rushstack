// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import {
  FileConstants,
  FileSystem,
  JsonFile,
  NewlineKind,
  PosixModeBits,
  type JsonObject,
  type JsonSchema
} from '@rushstack/node-core-library';

import type { IRushPluginConfiguration } from '../../api/RushPluginsConfiguration';
import type { RushConfiguration } from '../../api/RushConfiguration';
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
    return getStorePath(autoinstaller.folderFullPath);
  }

  /**
   * Files outside `common/config` from which Rush reads a configured plugin's manifest and command-line
   * shape without loading the plugin: the autoinstaller package.json, and the cached manifest and
   * command-line.json that `rush update` copies into the autoinstaller's store.
   */
  public static getPluginShapeFilePaths(
    rushConfiguration: RushConfiguration,
    pluginConfiguration: IRushPluginConfiguration
  ): string[] {
    const { autoinstallerName, packageName, pluginName } = pluginConfiguration;
    const autoinstallerFolder: string = path.join(
      rushConfiguration.commonAutoinstallersFolder,
      autoinstallerName
    );
    const storePath: string = getStorePath(autoinstallerFolder);
    return [
      path.join(autoinstallerFolder, FileConstants.PackageJson),
      getCachedManifestPath(storePath, packageName),
      getCachedCommandLineJsonFilePath(storePath, packageName, pluginName)
    ];
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

    // Use read+write instead of copy to ensure line endings are normalized
    const manifestContent: string = FileSystem.readFile(manifestPath);
    FileSystem.writeFile(destinationManifestPath, manifestContent, {
      convertLineEndings: NewlineKind.Lf,
      ensureFolderExists: true
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

      // Use read+write instead of copy to ensure line endings are normalized
      const commandLineContent: string = FileSystem.readFile(commandLineJsonFullFilePath);
      FileSystem.writeFile(destinationCommandLineJsonFilePath, commandLineContent, {
        convertLineEndings: NewlineKind.Lf,
        ensureFolderExists: true
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
    return getCachedManifestPath(
      AutoinstallerPluginLoader.getPluginAutoinstallerStorePath(this.autoinstaller),
      this.packageName
    );
  }

  protected override _getCommandLineJsonFilePath(): string {
    return getCachedCommandLineJsonFilePath(
      AutoinstallerPluginLoader.getPluginAutoinstallerStorePath(this.autoinstaller),
      this.packageName,
      this.pluginName
    );
  }
}

function getStorePath(autoinstallerFolder: string): string {
  return path.join(autoinstallerFolder, 'rush-plugins');
}

function getCachedManifestPath(storePath: string, packageName: string): string {
  return path.join(storePath, packageName, RushConstants.rushPluginManifestFilename);
}

function getCachedCommandLineJsonFilePath(
  storePath: string,
  packageName: string,
  pluginName: string
): string {
  return path.join(storePath, packageName, pluginName, RushConstants.commandLineFilename);
}
