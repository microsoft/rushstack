// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { Terminal, ITerminalProvider, IPackageJson } from '@rushstack/node-core-library';
import { trueCasePathSync } from 'true-case-path';

import { TaskPackageResolver, ITaskPackageResolution } from '../utilities/TaskPackageResolver';
import { Utilities } from '../utilities/Utilities';
import { Constants } from '../utilities/Constants';

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
 * The base action configuration that all custom action configuration files
 * should inherit from.
 *
 * @public
 */
export interface IHeftActionConfiguration {}

/**
 * Options to be used when retrieving the action configuration.
 *
 * @public
 */
export interface IHeftActionConfigurationOptions {
  /**
   * Whether or not arrays should be merged across Heft action configuration files.
   */
  mergeArrays?: boolean;
}

/**
 * @public
 */
export interface ICompilerPackage {
  apiExtractorPackagePath: string;
  typeScriptPackagePath: string;
  tslintPackagePath: string;
  eslintPackagePath: string;
}

/**
 * @public
 */
export class HeftConfiguration {
  private _buildFolder: string;
  private _projectHeftDataFolder: string | undefined;
  private _buildCacheFolder: string | undefined;
  private _terminal: Terminal;
  private _terminalProvider: ITerminalProvider;

  private _compilerPackage: ICompilerPackage | undefined;
  private _hasCompilerPackageBeenAccessed: boolean = false;

  /**
   * Project build folder. This is the folder containing the project's package.json file.
   */
  public get buildFolder(): string {
    return this._buildFolder;
  }

  /**
   * The path to the project's ".heft" folder.
   */
  public get projectHeftDataFolder(): string {
    if (!this._projectHeftDataFolder) {
      this._projectHeftDataFolder = path.join(this.buildFolder, Constants.projectHeftFolderName);
    }

    return this._projectHeftDataFolder;
  }

  /**
   * The project's build cache folder.
   *
   * This folder exists at \<project root\>/.heft/build-cache. TypeScript's output
   * goes into this folder and then is either copied or linked to the final output folder
   */
  public get buildCacheFolder(): string {
    if (!this._buildCacheFolder) {
      this._buildCacheFolder = path.join(this.projectHeftDataFolder, Constants.buildCacheFolderName);
    }

    return this._buildCacheFolder;
  }

  /**
   * Terminal instance to facilitate logging.
   */
  public get terminal(): Terminal {
    return this._terminal;
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
    return Utilities.packageJsonLookup.tryLoadPackageJsonFor(__dirname)!;
  }

  /**
   * The package.json of the project being built
   */
  public get projectPackageJson(): IPackageJson {
    return Utilities.packageJsonLookup.tryLoadPackageJsonFor(this.buildFolder)!;
  }

  /**
   * If used by the project being built, the tool package paths exported from
   * the rush-stack-compiler-* package.
   */
  public get compilerPackage(): ICompilerPackage | undefined {
    if (!this._hasCompilerPackageBeenAccessed) {
      const resolution: ITaskPackageResolution | undefined = TaskPackageResolver.resolveTaskPackages(
        this.terminal,
        this._buildFolder
      );

      this._hasCompilerPackageBeenAccessed = true;
      if (resolution) {
        this._compilerPackage = resolution;
      }
    }

    return this._compilerPackage;
  }

  private constructor() {}

  /**
   * @internal
   */
  public static initialize(options: IHeftConfigurationInitializationOptions): HeftConfiguration {
    const configuration: HeftConfiguration = new HeftConfiguration();

    const packageJsonPath: string | undefined = Utilities.packageJsonLookup.tryGetPackageJsonFilePathFor(
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
    configuration._terminal = new Terminal(options.terminalProvider);

    return configuration;
  }
}
