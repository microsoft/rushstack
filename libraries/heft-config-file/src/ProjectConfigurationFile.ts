// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as nodeJsPath from 'node:path';

import { FileSystem, PackageJsonLookup } from '@rushstack/node-core-library';
import type { ITerminal } from '@rushstack/terminal';
import type { IRigConfig } from '@rushstack/rig-package';

import {
  ConfigurationFileBase,
  type IOnConfigurationFileNotFoundCallback,
  type IConfigurationFileOptions
} from './ConfigurationFileBase.ts';

/**
 * @beta
 */
export interface IProjectConfigurationFileOptions {
  /**
   * A project root-relative path to the configuration file that should be loaded.
   */
  projectRelativeFilePath: string;
}

/**
 * Alias for the constructor type for {@link ProjectConfigurationFile}.
 * @beta
 */
export type IProjectConfigurationFileSpecification<TConfigFile> = IConfigurationFileOptions<
  TConfigFile,
  IProjectConfigurationFileOptions
>;

/**
 * @beta
 */
export class ProjectConfigurationFile<TConfigurationFile> extends ConfigurationFileBase<
  TConfigurationFile,
  IProjectConfigurationFileOptions
> {
  /** {@inheritDoc IProjectConfigurationFileOptions.projectRelativeFilePath} */
  public readonly projectRelativeFilePath: string;

  public constructor(options: IProjectConfigurationFileSpecification<TConfigurationFile>) {
    super(options);
    this.projectRelativeFilePath = options.projectRelativeFilePath;
  }

  /**
   * Find and return a configuration file for the specified project, automatically resolving
   * `extends` properties and handling rigged configuration files. Will throw an error if a configuration
   * file cannot be found in the rig or project config folder.
   */
  public loadConfigurationFileForProject(
    terminal: ITerminal,
    projectPath: string,
    rigConfig?: IRigConfig
  ): TConfigurationFile {
    const projectConfigurationFilePath: string = this._getConfigurationFilePathForProject(projectPath);
    return this._loadConfigurationFileInnerWithCache(
      terminal,
      projectConfigurationFilePath,
      PackageJsonLookup.instance.tryGetPackageFolderFor(projectPath),
      this._getRigConfigFallback(terminal, rigConfig)
    );
  }

  /**
   * Find and return a configuration file for the specified project, automatically resolving
   * `extends` properties and handling rigged configuration files. Will throw an error if a configuration
   * file cannot be found in the rig or project config folder.
   */
  public async loadConfigurationFileForProjectAsync(
    terminal: ITerminal,
    projectPath: string,
    rigConfig?: IRigConfig
  ): Promise<TConfigurationFile> {
    const projectConfigurationFilePath: string = this._getConfigurationFilePathForProject(projectPath);
    return await this._loadConfigurationFileInnerWithCacheAsync(
      terminal,
      projectConfigurationFilePath,
      PackageJsonLookup.instance.tryGetPackageFolderFor(projectPath),
      this._getRigConfigFallback(terminal, rigConfig)
    );
  }

  /**
   * This function is identical to {@link ProjectConfigurationFile.loadConfigurationFileForProject}, except
   * that it returns `undefined` instead of throwing an error if the configuration file cannot be found.
   */
  public tryLoadConfigurationFileForProject(
    terminal: ITerminal,
    projectPath: string,
    rigConfig?: IRigConfig
  ): TConfigurationFile | undefined {
    try {
      return this.loadConfigurationFileForProject(terminal, projectPath, rigConfig);
    } catch (e) {
      if (FileSystem.isNotExistError(e as Error)) {
        return undefined;
      }
      throw e;
    }
  }

  /**
   * This function is identical to {@link ProjectConfigurationFile.loadConfigurationFileForProjectAsync}, except
   * that it returns `undefined` instead of throwing an error if the configuration file cannot be found.
   */
  public async tryLoadConfigurationFileForProjectAsync(
    terminal: ITerminal,
    projectPath: string,
    rigConfig?: IRigConfig
  ): Promise<TConfigurationFile | undefined> {
    try {
      return await this.loadConfigurationFileForProjectAsync(terminal, projectPath, rigConfig);
    } catch (e) {
      if (FileSystem.isNotExistError(e as Error)) {
        return undefined;
      }
      throw e;
    }
  }

  private _getConfigurationFilePathForProject(projectPath: string): string {
    return nodeJsPath.resolve(projectPath, this.projectRelativeFilePath);
  }

  private _getRigConfigFallback(
    terminal: ITerminal,
    rigConfig: IRigConfig | undefined
  ): IOnConfigurationFileNotFoundCallback | undefined {
    return rigConfig
      ? (resolvedConfigurationFilePathForLogging: string) => {
          if (rigConfig.rigFound) {
            const rigProfileFolder: string = rigConfig.getResolvedProfileFolder();
            terminal.writeDebugLine(
              `Configuration file "${resolvedConfigurationFilePathForLogging}" does not exist. Attempting to load via rig ("${ConfigurationFileBase._formatPathForLogging(rigProfileFolder)}").`
            );
            return nodeJsPath.resolve(rigProfileFolder, this.projectRelativeFilePath);
          } else {
            terminal.writeDebugLine(
              `No rig found for "${ConfigurationFileBase._formatPathForLogging(rigConfig.projectFolderPath)}"`
            );
          }
        }
      : undefined;
  }
}
