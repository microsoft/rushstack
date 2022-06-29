// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import {
  Terminal,
  ITerminalProvider,
  IPackageJson,
  PackageJsonLookup,
  InternalError
} from '@rushstack/node-core-library';
import { trueCasePathSync } from 'true-case-path';
import { RigConfig } from '@rushstack/rig-package';

import { Constants } from '../utilities/Constants';
import { RigToolResolver, type IRigToolResolver } from './RigToolResolver';

/**
 * @internal
 */
export interface IHeftConfigurationInitializationOptions {
  /**
   * The working directory the tool was executed in.
   */
  cwd: string;

  /**
   * Terminal instance to facilitate logging.
   */
  terminalProvider: ITerminalProvider;
}

/**
 * @public
 */
export class HeftConfiguration {
  private _buildFolder!: string;
  private _projectHeftDataFolder: string | undefined;
  private _projectConfigFolder: string | undefined;
  private _cacheFolder: string | undefined;
  private _tempFolder: string | undefined;
  private _rigConfig: RigConfig | undefined;
  private _globalTerminal!: Terminal;
  private _terminalProvider!: ITerminalProvider;
  private _rigToolResolver!: RigToolResolver;

  /**
   * Project build folder. This is the folder containing the project's package.json file.
   */
  public get buildFolder(): string {
    return this._buildFolder;
  }

  /**
   * The path to the project's "config" folder.
   */
  public get projectConfigFolder(): string {
    if (!this._projectConfigFolder) {
      this._projectConfigFolder = path.join(this.buildFolder, Constants.projectConfigFolderName);
    }

    return this._projectConfigFolder;
  }

  /**
   * The project's cache folder.
   *
   * @remarks This folder exists at \<project root\>/.cache. In general, this folder is used to store
   * cached output from tasks under task-specific subfolders, and is not intended to be directly
   * written to. Instead, plugins should write to the directory provided by
   * HeftTaskSession.taskCacheFolder
   */
  public get cacheFolder(): string {
    if (!this._cacheFolder) {
      this._cacheFolder = path.join(this.buildFolder, Constants.cacheFolderName);
    }

    return this._cacheFolder;
  }

  /**
   * The project's temporary folder.
   *
   * @remarks This folder exists at \<project root\>/temp. In general, this folder is used to store temporary
   * output from tasks under task-specific subfolders, and is not intended to be directly written to.
   * Instead, plugins should write to the directory provided by HeftTaskSession.taskTempFolder
   */
  public get tempFolder(): string {
    if (!this._tempFolder) {
      this._tempFolder = path.join(this._buildFolder, Constants.tempFolderName);
    }

    return this._tempFolder;
  }

  /**
   * The rig.json configuration for this project, if present.
   */
  public get rigConfig(): RigConfig {
    if (!this._rigConfig) {
      throw new InternalError(
        'The rigConfig cannot be accessed until HeftConfiguration.checkForRigAsync() has been called'
      );
    }
    return this._rigConfig;
  }

  public get rigToolResolver(): IRigToolResolver {
    if (!this._rigToolResolver) {
      this._rigToolResolver = new RigToolResolver({
        buildFolder: this.buildFolder,
        projectPackageJson: this.projectPackageJson,
        rigConfig: this.rigConfig
      });
    }
    return this._rigToolResolver;
  }

  /**
   * Terminal instance to facilitate logging.
   */
  public get globalTerminal(): Terminal {
    return this._globalTerminal;
  }

  /**
   * Terminal provider for the provided terminal.
   */
  public get terminalProvider(): ITerminalProvider {
    return this._terminalProvider;
  }

  /**
   * The Heft tool's package.json
   */
  public get heftPackageJson(): IPackageJson {
    return PackageJsonLookup.instance.tryLoadPackageJsonFor(__dirname)!;
  }

  /**
   * The package.json of the project being built
   */
  public get projectPackageJson(): IPackageJson {
    return PackageJsonLookup.instance.tryLoadPackageJsonFor(this.buildFolder)!;
  }

  private constructor() {}

  /**
   * Performs the search for rig.json and initializes the `HeftConfiguration.rigConfig` object.
   * @internal
   */
  public async _checkForRigAsync(): Promise<void> {
    if (!this._rigConfig) {
      this._rigConfig = await RigConfig.loadForProjectFolderAsync({ projectFolderPath: this._buildFolder });
    }
  }

  /**
   * @internal
   */
  public static initialize(options: IHeftConfigurationInitializationOptions): HeftConfiguration {
    const configuration: HeftConfiguration = new HeftConfiguration();

    const packageJsonPath: string | undefined = PackageJsonLookup.instance.tryGetPackageJsonFilePathFor(
      options.cwd
    );
    if (packageJsonPath) {
      let buildFolder: string = path.dirname(packageJsonPath);
      // The CWD path's casing may be incorrect on a case-insensitive filesystem. Some tools, like Jest
      // expect the casing of the project path to be correct and produce unexpected behavior when the casing
      // isn't correct.
      // This ensures the casing of the project folder is correct.
      buildFolder = trueCasePathSync(buildFolder);
      configuration._buildFolder = buildFolder;
    } else {
      throw new Error('No package.json file found. Are you in a project folder?');
    }

    configuration._terminalProvider = options.terminalProvider;
    configuration._globalTerminal = new Terminal(options.terminalProvider);
    return configuration;
  }
}
