// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import {
  Terminal,
  type ITerminalProvider,
  type IPackageJson,
  PackageJsonLookup,
  InternalError,
  type ITerminal
} from '@rushstack/node-core-library';
import { trueCasePathSync } from 'true-case-path';
import { type IRigConfig, RigConfig } from '@rushstack/rig-package';

import { Constants } from '../utilities/Constants';
import { RigPackageResolver, type IRigPackageResolver } from './RigPackageResolver';

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
  private _buildFolderPath!: string;
  private _projectConfigFolderPath: string | undefined;
  private _cacheFolderPath: string | undefined;
  private _tempFolderPath: string | undefined;
  private _rigConfig: IRigConfig | undefined;
  private _globalTerminal!: Terminal;
  private _terminalProvider!: ITerminalProvider;
  private _rigPackageResolver!: RigPackageResolver;

  /**
   * Project build folder path. This is the folder containing the project's package.json file.
   */
  public get buildFolderPath(): string {
    return this._buildFolderPath;
  }

  /**
   * The path to the project's "config" folder.
   */
  public get projectConfigFolderPath(): string {
    if (!this._projectConfigFolderPath) {
      this._projectConfigFolderPath = path.join(this.buildFolderPath, Constants.projectConfigFolderName);
    }

    return this._projectConfigFolderPath;
  }

  /**
   * The project's temporary folder.
   *
   * @remarks This folder exists at \<project root\>/temp. In general, this folder is used to store temporary
   * output from tasks under task-specific subfolders, and is not intended to be directly written to.
   * Instead, plugins should write to the directory provided by HeftTaskSession.taskTempFolderPath
   */
  public get tempFolderPath(): string {
    if (!this._tempFolderPath) {
      this._tempFolderPath = path.join(this._buildFolderPath, Constants.tempFolderName);
    }

    return this._tempFolderPath;
  }

  /**
   * The rig.json configuration for this project, if present.
   */
  public get rigConfig(): IRigConfig {
    if (!this._rigConfig) {
      throw new InternalError(
        'The rigConfig cannot be accessed until HeftConfiguration.checkForRigAsync() has been called'
      );
    }
    return this._rigConfig;
  }

  /**
   * The rig package resolver, which can be used to rig-resolve a requested package.
   */
  public get rigPackageResolver(): IRigPackageResolver {
    if (!this._rigPackageResolver) {
      this._rigPackageResolver = new RigPackageResolver({
        buildFolder: this.buildFolderPath,
        projectPackageJson: this.projectPackageJson,
        rigConfig: this.rigConfig
      });
    }
    return this._rigPackageResolver;
  }

  /**
   * Terminal instance to facilitate logging.
   */
  public get globalTerminal(): ITerminal {
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
    return PackageJsonLookup.instance.tryLoadPackageJsonFor(this.buildFolderPath)!;
  }

  private constructor() {}

  /**
   * Performs the search for rig.json and initializes the `HeftConfiguration.rigConfig` object.
   * @internal
   */
  public async _checkForRigAsync(): Promise<void> {
    if (!this._rigConfig) {
      this._rigConfig = await RigConfig.loadForProjectFolderAsync({
        projectFolderPath: this._buildFolderPath
      });
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
      let buildFolderPath: string = path.dirname(packageJsonPath);
      // The CWD path's casing may be incorrect on a case-insensitive filesystem. Some tools, like Jest
      // expect the casing of the project path to be correct and produce unexpected behavior when the casing
      // isn't correct.
      // This ensures the casing of the project folder is correct.
      buildFolderPath = trueCasePathSync(buildFolderPath);
      configuration._buildFolderPath = buildFolderPath;
    } else {
      throw new Error('No package.json file found. Are you in a project folder?');
    }

    configuration._terminalProvider = options.terminalProvider;
    configuration._globalTerminal = new Terminal(options.terminalProvider);
    return configuration;
  }
}
