// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

// Inline type specifiers keep the API report identical; TypeScript elides these imports at runtime
// eslint-disable-next-line @typescript-eslint/no-import-type-side-effects
import { type IPackageJson, type PackageJsonLookup, type InternalError } from '@rushstack/node-core-library';
import { Terminal, type ITerminalProvider, type ITerminal } from '@rushstack/terminal';
// eslint-disable-next-line @typescript-eslint/no-import-type-side-effects
import {
  type IProjectConfigurationFileSpecification,
  type ProjectConfigurationFile
} from '@rushstack/heft-config-file';
// eslint-disable-next-line @typescript-eslint/no-import-type-side-effects
import { type IRigConfig, type RigConfig } from '@rushstack/rig-package';

import { Constants } from '../utilities/Constants';
import type { RigPackageResolver, IRigPackageResolver } from './RigPackageResolver';
import { getSharedLeanPackageJsonLookup, LeanBailError } from './lean/LeanResolution';
import type { tryLoadProjectConfigurationFileLean } from './lean/LeanConfigurationFileSpecification';
import type { ILeanLoadResult } from './lean/LeanProjectConfigurationFile';
import { LeanRigConfig, tryLoadRigConfigDataLean, type ILeanRigConfigData } from './lean/LeanRigConfig';

// These are loaded lazily, since they are not needed on Heft's startup path
function getPackageJsonLookupInstance(): PackageJsonLookup {
  const { PackageJsonLookup: PackageJsonLookupClass } = require('@rushstack/node-core-library');
  return (PackageJsonLookupClass as typeof PackageJsonLookup).instance;
}

function getInternalErrorClass(): typeof InternalError {
  return require('@rushstack/node-core-library').InternalError;
}

function getProjectConfigurationFileClass(): typeof ProjectConfigurationFile {
  return require('@rushstack/heft-config-file').ProjectConfigurationFile;
}

// Not a member of HeftConfiguration, to keep the public API unchanged
const _rigConfigsForConfigLoading: WeakMap<HeftConfiguration, () => IRigConfig> = new WeakMap();

/**
 * Returns a rig config for Heft's own configuration loading. It has the same data as
 * `HeftConfiguration.rigConfig`, but it only loads `@rushstack/rig-package` if one of its methods is called.
 */
export function getRigConfigForConfigLoading(heftConfiguration: HeftConfiguration): IRigConfig {
  return _rigConfigsForConfigLoading.get(heftConfiguration)!();
}

function getRigConfigClass(): typeof RigConfig {
  return require('@rushstack/rig-package').RigConfig;
}

function getRigPackageResolverClass(): typeof RigPackageResolver {
  return require('./RigPackageResolver').RigPackageResolver;
}

/**
 * Equivalent to `PackageJsonLookup.instance.tryGetPackageJsonFilePathFor(folderPath)`, without loading
 * `@rushstack/node-core-library` in the common case.
 */
function tryGetPackageJsonFilePathFor(folderPath: string): {
  packageJsonPath: string | undefined;
  lean: boolean;
} {
  let packageFolder: string | undefined;
  try {
    packageFolder = getSharedLeanPackageJsonLookup().tryGetPackageFolderFor(folderPath);
  } catch {
    // The lean lookup can't guarantee an identical result; use the original implementation
    return {
      packageJsonPath: getPackageJsonLookupInstance().tryGetPackageJsonFilePathFor(folderPath),
      lean: false
    };
  }

  return {
    packageJsonPath: packageFolder ? path.join(packageFolder, 'package.json') : undefined,
    lean: true
  };
}

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

  /**
   * The number of CPU cores available to the process. This is used to determine how many tasks can be run in parallel.
   */
  numberOfCores: number;
}

interface IHeftConfigurationOptions extends IHeftConfigurationInitializationOptions {
  buildFolderPath: string;
}

interface IProjectConfigurationFileEntry<TConfigFile> {
  options: IProjectConfigurationFileSpecification<TConfigFile>;
  loader: ProjectConfigurationFile<TConfigFile>;
}

/**
 * @public
 */
export class HeftConfiguration {
  #slashNormalizedBuildFolderPath: string | undefined;
  #projectConfigFolderPath: string | undefined;
  #tempFolderPath: string | undefined;
  // Whether initialize() found the project's package.json with the shared lean lookup
  #projectPackageJsonFromLeanLookup: boolean = false;
  // The genuine RigConfig object. If #leanRigConfig is set, it is only created when it is needed.
  #rigConfig: IRigConfig | undefined;
  // The rig data read without loading @rushstack/rig-package; its methods delegate to #rigConfig
  #leanRigConfig: LeanRigConfig | undefined;
  #rigPackageResolver: RigPackageResolver | undefined;

  readonly #knownConfigurationFiles: Map<string, IProjectConfigurationFileEntry<unknown>> = new Map();

  /**
   * Project build folder path. This is the folder containing the project's package.json file.
   */
  public readonly buildFolderPath: string;

  /**
   * {@link HeftConfiguration.buildFolderPath} with all path separators converted to forward slashes.
   */
  public get slashNormalizedBuildFolderPath(): string {
    if (!this.#slashNormalizedBuildFolderPath) {
      // Equivalent to Path.convertToSlashes() from @rushstack/node-core-library
      this.#slashNormalizedBuildFolderPath = this.buildFolderPath.split('\\').join('/');
    }

    return this.#slashNormalizedBuildFolderPath;
  }

  /**
   * The path to the project's "config" folder.
   */
  public get projectConfigFolderPath(): string {
    if (!this.#projectConfigFolderPath) {
      this.#projectConfigFolderPath = path.join(this.buildFolderPath, Constants.projectConfigFolderName);
    }

    return this.#projectConfigFolderPath;
  }

  /**
   * The project's temporary folder.
   *
   * @remarks This folder exists at \<project root\>/temp. In general, this folder is used to store temporary
   * output from tasks under task-specific subfolders, and is not intended to be directly written to.
   * Instead, plugins should write to the directory provided by HeftTaskSession.taskTempFolderPath
   */
  public get tempFolderPath(): string {
    if (!this.#tempFolderPath) {
      this.#tempFolderPath = path.join(this.buildFolderPath, Constants.tempFolderName);
    }

    return this.#tempFolderPath;
  }

  /**
   * The rig.json configuration for this project, if present.
   */
  public get rigConfig(): IRigConfig {
    if (!this.#rigConfig && this.#leanRigConfig) {
      // Returns the same object as RigConfig.loadForProjectFolder() calls by other code (like before)
      this.#rigConfig = getRigConfigClass().loadForProjectFolder({
        projectFolderPath: this.buildFolderPath
      });
    }

    if (!this.#rigConfig) {
      throw new (getInternalErrorClass())(
        'The rigConfig cannot be accessed until HeftConfiguration.checkForRigAsync() has been called'
      );
    }
    return this.#rigConfig;
  }

  /**
   * The rig package resolver, which can be used to rig-resolve a requested package.
   */
  public get rigPackageResolver(): IRigPackageResolver {
    if (!this.#rigPackageResolver) {
      this.#rigPackageResolver = new (getRigPackageResolverClass())({
        buildFolder: this.buildFolderPath,
        projectPackageJson: this.projectPackageJson,
        rigConfig: this.rigConfig
      });
    }

    return this.#rigPackageResolver;
  }

  /**
   * Terminal instance to facilitate logging.
   */
  public readonly globalTerminal: ITerminal;

  /**
   * Terminal provider for the provided terminal.
   */
  public readonly terminalProvider: ITerminalProvider;

  /**
   * The Heft tool's package.json
   */
  public get heftPackageJson(): IPackageJson {
    return getPackageJsonLookupInstance().tryLoadPackageJsonFor(__dirname)!;
  }

  /**
   * The package.json of the project being built
   */
  public get projectPackageJson(): IPackageJson {
    if (this.#projectPackageJsonFromLeanLookup) {
      // Like the original implementation (where initialize() cached the package.json in PackageJsonLookup.instance),
      // this returns the contents read at startup, without loading @rushstack/node-core-library.
      try {
        return getSharedLeanPackageJsonLookup().tryLoadPackageJsonFor(this.buildFolderPath)! as IPackageJson;
      } catch (e) {
        if (!(e instanceof LeanBailError)) {
          throw e;
        }
      }
    }

    return getPackageJsonLookupInstance().tryLoadPackageJsonFor(this.buildFolderPath)!;
  }

  /**
   * The number of CPU cores available to the process. This can be used to determine how many tasks can be run
   * in parallel.
   */
  public readonly numberOfCores: number;

  private constructor({ terminalProvider, buildFolderPath, numberOfCores }: IHeftConfigurationOptions) {
    this.buildFolderPath = buildFolderPath;
    this.terminalProvider = terminalProvider;
    this.numberOfCores = numberOfCores;
    this.globalTerminal = new Terminal(terminalProvider);
    _rigConfigsForConfigLoading.set(this, () => this.#leanRigConfig ?? this.rigConfig);
  }

  /**
   * Performs the search for rig.json and initializes the `HeftConfiguration.rigConfig` object.
   * @internal
   */
  public async _checkForRigAsync(): Promise<void> {
    if (!this.#rigConfig && !this.#leanRigConfig) {
      const leanRigConfigData: ILeanRigConfigData | undefined = tryLoadRigConfigDataLean(
        this.buildFolderPath
      );
      if (leanRigConfigData) {
        this.#leanRigConfig = new LeanRigConfig(leanRigConfigData, () => this.rigConfig);
        return;
      }

      // Use the original implementation, which reports errors in rig.json
      this.#rigConfig = await getRigConfigClass().loadForProjectFolderAsync({
        projectFolderPath: this.buildFolderPath
      });
    }
  }

  /**
   * The value that the original implementation passed to the configuration file loaders.
   */
  #getRigConfigForOriginalLoader(): IRigConfig | undefined {
    return this.#leanRigConfig ? this.rigConfig : this.#rigConfig;
  }

  /**
   * Attempts to load a riggable project configuration file using blocking, synchronous I/O.
   * @param options - The options for the configuration file loader from `@rushstack/heft-config-file`. If invoking this function multiple times for the same file, reuse the same object.
   * @param terminal - The terminal to log messages during configuration file loading.
   * @returns The configuration file, or undefined if it could not be loaded.
   */
  public tryLoadProjectConfigurationFile<TConfigFile>(
    options: IProjectConfigurationFileSpecification<TConfigFile>,
    terminal: ITerminal
  ): TConfigFile | undefined {
    const leanResult: ILeanLoadResult<TConfigFile | undefined> | undefined =
      this.#tryLoadProjectConfigurationFileLean(options, terminal);
    if (leanResult) {
      return leanResult.configurationFile;
    }

    const loader: ProjectConfigurationFile<TConfigFile> = this.#getConfigFileLoader(options);
    return loader.tryLoadConfigurationFileForProject(
      terminal,
      this.buildFolderPath,
      this.#getRigConfigForOriginalLoader()
    );
  }

  /**
   * Attempts to load a riggable project configuration file using asynchronous I/O.
   * @param options - The options for the configuration file loader from `@rushstack/heft-config-file`. If invoking this function multiple times for the same file, reuse the same object.
   * @param terminal - The terminal to log messages during configuration file loading.
   * @returns A promise that resolves to the configuration file, or undefined if it could not be loaded.
   */
  public async tryLoadProjectConfigurationFileAsync<TConfigFile>(
    options: IProjectConfigurationFileSpecification<TConfigFile>,
    terminal: ITerminal
  ): Promise<TConfigFile | undefined> {
    const leanResult: ILeanLoadResult<TConfigFile | undefined> | undefined =
      this.#tryLoadProjectConfigurationFileLean(options, terminal);
    if (leanResult) {
      return leanResult.configurationFile;
    }

    const loader: ProjectConfigurationFile<TConfigFile> = this.#getConfigFileLoader(options);
    return loader.tryLoadConfigurationFileForProjectAsync(
      terminal,
      this.buildFolderPath,
      this.#getRigConfigForOriginalLoader()
    );
  }

  /**
   * @internal
   */
  public static initialize(options: IHeftConfigurationInitializationOptions): HeftConfiguration {
    const { packageJsonPath, lean } = tryGetPackageJsonFilePathFor(options.cwd);
    let buildFolderPath: string;
    if (packageJsonPath) {
      buildFolderPath = path.dirname(packageJsonPath);
      // On Windows it is possible for the drive letter in the CWD to be lowercase, but the normalized naming is uppercase
      // Force it to always be uppercase for consistency.
      buildFolderPath =
        process.platform === 'win32'
          ? buildFolderPath.charAt(0).toUpperCase() + buildFolderPath.slice(1)
          : buildFolderPath;
    } else {
      throw new Error('No package.json file found. Are you in a project folder?');
    }

    const configuration: HeftConfiguration = new HeftConfiguration({
      ...options,
      buildFolderPath
    });
    configuration.#projectPackageJsonFromLeanLookup = lean;
    return configuration;
  }

  /**
   * Loads the configuration file without `@rushstack/heft-config-file` (and without compiling its schema), if the
   * result is guaranteed to be identical. Returns `undefined` otherwise.
   */
  #tryLoadProjectConfigurationFileLean<TConfigFile>(
    options: IProjectConfigurationFileSpecification<TConfigFile>,
    terminal: ITerminal
  ): ILeanLoadResult<TConfigFile | undefined> | undefined {
    // Same checks and side effects on the options object as #getConfigFileLoader()
    const entry: IProjectConfigurationFileEntry<TConfigFile> | undefined = this.#knownConfigurationFiles.get(
      options.projectRelativeFilePath
    ) as IProjectConfigurationFileEntry<TConfigFile> | undefined;
    if (entry) {
      // Let #getConfigFileLoader() handle this
      return undefined;
    }

    Object.freeze(options);

    const leanRigConfig: LeanRigConfig | undefined = this.#leanRigConfig;
    const rigConfig: IRigConfig | undefined = leanRigConfig ?? this.#rigConfig;
    const { tryLoadProjectConfigurationFileLean: tryLoadProjectConfigurationFileLeanFunction } =
      require('./lean/LeanConfigurationFileSpecification') as {
        tryLoadProjectConfigurationFileLean: typeof tryLoadProjectConfigurationFileLean;
      };
    const leanResult: ILeanLoadResult<TConfigFile | undefined> | undefined =
      tryLoadProjectConfigurationFileLeanFunction(
        options,
        this.buildFolderPath,
        rigConfig,
        // The profile folder of a LeanRigConfig can be resolved without side effects
        rigConfig === leanRigConfig
      );
    if (leanResult) {
      for (const message of leanResult.debugMessages) {
        terminal.writeDebugLine(message);
      }
    }

    return leanResult;
  }

  #getConfigFileLoader<TConfigFile>(
    options: IProjectConfigurationFileSpecification<TConfigFile>
  ): ProjectConfigurationFile<TConfigFile> {
    let entry: IProjectConfigurationFileEntry<TConfigFile> | undefined = this.#knownConfigurationFiles.get(
      options.projectRelativeFilePath
    ) as IProjectConfigurationFileEntry<TConfigFile> | undefined;

    if (!entry) {
      entry = {
        options: Object.freeze(options),
        loader: new (getProjectConfigurationFileClass())<TConfigFile>(options)
      };
    } else if (options !== entry.options) {
      throw new Error(
        `The project configuration file for ${options.projectRelativeFilePath} has already been loaded with different options. Please ensure that options object used to load the configuration file is the same referenced object in all calls.`
      );
    }

    return entry.loader;
  }
}
