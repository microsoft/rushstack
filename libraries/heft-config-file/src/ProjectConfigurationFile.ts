// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as nodeJsPath from 'path';
import { FileSystem } from '@rushstack/node-core-library';
import type { ITerminal } from '@rushstack/terminal';
import type { IRigConfig } from '@rushstack/rig-package';

import { ConfigurationFileBase, type IConfigurationFileOptions } from './ConfigurationFileBase';

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
 * @beta
 */
export class ProjectConfigurationFile<TConfigurationFile> extends ConfigurationFileBase<
  TConfigurationFile,
  IProjectConfigurationFileOptions
> {
  /** {@inheritDoc IProjectConfigurationFileOptions.projectRelativeFilePath} */
  public readonly projectRelativeFilePath: string;

  public constructor(
    options: IConfigurationFileOptions<TConfigurationFile, IProjectConfigurationFileOptions>
  ) {
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
      new Set<string>(),
      rigConfig
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
      new Set<string>(),
      rigConfig
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

  protected _tryLoadConfigurationFileInRig(
    terminal: ITerminal,
    rigConfig: IRigConfig,
    visitedConfigurationFilePaths: Set<string>
  ): TConfigurationFile | undefined {
    if (rigConfig.rigFound) {
      const rigProfileFolder: string = rigConfig.getResolvedProfileFolder();
      try {
        return this._loadConfigurationFileInnerWithCache(
          terminal,
          nodeJsPath.resolve(rigProfileFolder, this.projectRelativeFilePath),
          visitedConfigurationFilePaths,
          undefined
        );
      } catch (e) {
        // Ignore cases where a configuration file doesn't exist in a rig
        if (!FileSystem.isNotExistError(e as Error)) {
          throw e;
        } else {
          terminal.writeDebugLine(
            `Configuration file "${
              this.projectRelativeFilePath
            }" not found in rig ("${ConfigurationFileBase._formatPathForLogging(rigProfileFolder)}")`
          );
        }
      }
    } else {
      terminal.writeDebugLine(
        `No rig found for "${ConfigurationFileBase._formatPathForLogging(rigConfig.projectFolderPath)}"`
      );
    }

    return undefined;
  }

  protected async _tryLoadConfigurationFileInRigAsync(
    terminal: ITerminal,
    rigConfig: IRigConfig,
    visitedConfigurationFilePaths: Set<string>
  ): Promise<TConfigurationFile | undefined> {
    if (rigConfig.rigFound) {
      const rigProfileFolder: string = await rigConfig.getResolvedProfileFolderAsync();
      try {
        return await this._loadConfigurationFileInnerWithCacheAsync(
          terminal,
          nodeJsPath.resolve(rigProfileFolder, this.projectRelativeFilePath),
          visitedConfigurationFilePaths,
          undefined
        );
      } catch (e) {
        // Ignore cases where a configuration file doesn't exist in a rig
        if (!FileSystem.isNotExistError(e as Error)) {
          throw e;
        } else {
          terminal.writeDebugLine(
            `Configuration file "${
              this.projectRelativeFilePath
            }" not found in rig ("${ConfigurationFileBase._formatPathForLogging(rigProfileFolder)}")`
          );
        }
      }
    } else {
      terminal.writeDebugLine(
        `No rig found for "${ConfigurationFileBase._formatPathForLogging(rigConfig.projectFolderPath)}"`
      );
    }

    return undefined;
  }

  private _getConfigurationFilePathForProject(projectPath: string): string {
    return nodeJsPath.resolve(projectPath, this.projectRelativeFilePath);
  }
}
