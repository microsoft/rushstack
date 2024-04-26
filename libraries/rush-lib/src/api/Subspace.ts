// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';

import { FileSystem } from '@rushstack/node-core-library';
import type { RushConfiguration } from './RushConfiguration';
import type { RushConfigurationProject } from './RushConfigurationProject';
import { EnvironmentConfiguration } from './EnvironmentConfiguration';
import { RushConstants } from '../logic/RushConstants';
import { CommonVersionsConfiguration } from './CommonVersionsConfiguration';
import { RepoStateFile } from '../logic/RepoStateFile';
import type { PnpmPackageManager } from './packageManager/PnpmPackageManager';
import { PnpmOptionsConfiguration } from '../logic/pnpm/PnpmOptionsConfiguration';

/**
 * @internal
 */
export interface ISubspaceOptions {
  subspaceName: string;
  rushConfiguration: RushConfiguration;
  splitWorkspaceCompatibility: boolean;
}

interface ISubspaceDetail {
  subspaceConfigFolder: string;
  subspaceTempFolder: string;
  tempShrinkwrapFilename: string;
  tempShrinkwrapPreinstallFilename: string;
}

/**
 * This represents the subspace configurations for a repository, based on the "subspaces.json"
 * configuration file.
 * @public
 */
export class Subspace {
  public readonly subspaceName: string;
  private readonly _rushConfiguration: RushConfiguration;
  private readonly _projects: RushConfigurationProject[] = [];
  private readonly _splitWorkspaceCompatibility: boolean;
  private _commonVersionsConfiguration: CommonVersionsConfiguration | undefined = undefined;

  private _detail: ISubspaceDetail | undefined;

  private _cachedPnpmOptions: PnpmOptionsConfiguration | undefined = undefined;
  // If true, then _cachedPnpmOptions has been initialized.
  private _cachedPnpmOptionsInitialized: boolean = false;

  public constructor(options: ISubspaceOptions) {
    this.subspaceName = options.subspaceName;
    this._rushConfiguration = options.rushConfiguration;
    this._splitWorkspaceCompatibility = options.splitWorkspaceCompatibility;
  }

  /**
   * Returns the list of projects belonging to this subspace.
   * @beta
   */
  public getProjects(): RushConfigurationProject[] {
    return this._projects;
  }

  /**
   * Returns the parsed contents of the pnpm-config.json config file.
   * @beta
   */
  public getPnpmOptions(): PnpmOptionsConfiguration | undefined {
    if (!this._cachedPnpmOptionsInitialized) {
      try {
        this._cachedPnpmOptions = PnpmOptionsConfiguration.loadFromJsonFileOrThrow(
          `${this.getSubspaceConfigFolder()}/${RushConstants.pnpmConfigFilename}`,
          this.getSubspaceTempFolder()
        );
        this._cachedPnpmOptionsInitialized = true;
      } catch (e) {
        if (FileSystem.isNotExistError(e as Error)) {
          this._cachedPnpmOptions = undefined;
          this._cachedPnpmOptionsInitialized = true;
        } else {
          throw new Error(`The subspace has an invalid pnpm-config.json file: ${this.subspaceName}`);
        }
      }
    }
    return this._cachedPnpmOptions;
  }

  private _ensureDetail(): ISubspaceDetail {
    if (!this._detail) {
      const rushConfiguration: RushConfiguration = this._rushConfiguration;
      let subspaceConfigFolder: string;

      if (rushConfiguration.subspacesFeatureEnabled) {
        // If this subspace doesn't have a configuration folder, check if it is in the project folder itself
        // if the splitWorkspaceCompatibility option is enabled in the subspace configuration

        // Example: C:\MyRepo\common\config\subspaces\my-subspace
        const standardSubspaceConfigFolder: string = `${rushConfiguration.commonFolder}/config/subspaces/${this.subspaceName}`;

        subspaceConfigFolder = standardSubspaceConfigFolder;

        if (this._splitWorkspaceCompatibility && this.subspaceName.startsWith('split_')) {
          if (FileSystem.exists(standardSubspaceConfigFolder + '/pnpm-lock.yaml')) {
            throw new Error(
              `The split workspace subspace "${this.subspaceName}" cannot use a common/config folder: ` +
                standardSubspaceConfigFolder
            );
          }

          if (this._projects.length !== 1) {
            throw new Error(
              `The split workspace subspace "${this.subspaceName}" contains ${this._projects.length}` +
                ` projects; there must be exactly one project.`
            );
          }
          const project: RushConfigurationProject = this._projects[0];

          subspaceConfigFolder = `${project.projectFolder}/subspace/${this.subspaceName}`;

          // Ensure that this project does not have it's own pnpmfile.cjs or .npmrc file
          if (FileSystem.exists(`${project.projectFolder}/.npmrc`)) {
            throw new Error(
              `The project level configuration file ${project.projectFolder}/.npmrc is no longer valid. Please use a ${subspaceConfigFolder}/.npmrc file instead.`
            );
          }
          if (FileSystem.exists(`${project.projectFolder}/.pnpmfile.cjs`)) {
            throw new Error(
              `The project level configuration file ${project.projectFolder}/.pnpmfile.cjs is no longer valid. Please use a ${subspaceConfigFolder}/.pnpmfile-subspace.cjs file instead.`
            );
          }
        }

        if (!FileSystem.exists(subspaceConfigFolder)) {
          throw new Error(
            `The configuration folder for the "${this.subspaceName}" subspace does not exist: ` +
              subspaceConfigFolder
          );
        }
      } else {
        // Example: C:\MyRepo\common\config\rush
        subspaceConfigFolder = rushConfiguration.commonRushConfigFolder;
      }

      // Example: C:\MyRepo\common\temp
      const commonTempFolder: string =
        EnvironmentConfiguration.rushTempFolderOverride || rushConfiguration.commonTempFolder;

      let subspaceTempFolder: string;
      if (rushConfiguration.subspacesFeatureEnabled) {
        // Example: C:\MyRepo\common\temp\my-subspace
        subspaceTempFolder = path.join(commonTempFolder, this.subspaceName);
      } else {
        // Example: C:\MyRepo\common\temp
        subspaceTempFolder = commonTempFolder;
      }

      // Example: C:\MyRepo\common\temp\my-subspace\pnpm-lock.yaml
      const tempShrinkwrapFilename: string = subspaceTempFolder + `/${rushConfiguration.shrinkwrapFilename}`;

      /// From "C:\MyRepo\common\temp\pnpm-lock.yaml" --> "C:\MyRepo\common\temp\pnpm-lock-preinstall.yaml"
      const parsedPath: path.ParsedPath = path.parse(tempShrinkwrapFilename);
      const tempShrinkwrapPreinstallFilename: string = path.join(
        parsedPath.dir,
        parsedPath.name + '-preinstall' + parsedPath.ext
      );

      this._detail = {
        subspaceConfigFolder,
        subspaceTempFolder,
        tempShrinkwrapFilename,
        tempShrinkwrapPreinstallFilename
      };
    }
    return this._detail;
  }

  /**
   * Returns the full path of the folder containing this subspace's configuration files such as `pnpm-lock.yaml`.
   *
   * Example: `common/config/subspaces/my-subspace`
   * @beta
   */
  public getSubspaceConfigFolder(): string {
    return this._ensureDetail().subspaceConfigFolder;
  }

  /**
   * The folder where the subspace's node_modules and other temporary files will be stored.
   *
   * Example: `common/temp/subspaces/my-subspace`
   * @beta
   */
  public getSubspaceTempFolder(): string {
    return this._ensureDetail().subspaceTempFolder;
  }

  /**
   * Returns full path of the temporary shrinkwrap file for a specific subspace and returns the common workspace
   * shrinkwrap if no subspaceName is provided.
   * @remarks
   * This function takes the subspace name, and returns the full path for the subspace's shrinkwrap file.
   * This function also consults the deprecated option to allow for shrinkwraps to be stored under a package folder.
   * This shrinkwrap file is used during "rush install", and may be rewritten by the package manager during installation
   * This property merely reports the filename, the file itself may not actually exist.
   * example: `C:\MyRepo\common\<subspace_name>\pnpm-lock.yaml`
   * @beta
   */
  public getTempShrinkwrapFilename(): string {
    return this._ensureDetail().tempShrinkwrapFilename;
  }

  /**
   * The full path of a backup copy of tempShrinkwrapFilename. This backup copy is made
   * before installation begins, and can be compared to determine how the package manager
   * modified tempShrinkwrapFilename.
   * @remarks
   * This property merely reports the filename; the file itself may not actually exist.
   * Example: `C:\MyRepo\common\temp\npm-shrinkwrap-preinstall.json`
   * or `C:\MyRepo\common\temp\pnpm-lock-preinstall.yaml`
   * @beta
   */
  public getTempShrinkwrapPreinstallFilename(subspaceName?: string | undefined): string {
    return this._ensureDetail().tempShrinkwrapPreinstallFilename;
  }

  /**
   * Gets the path to the common-versions.json config file for this subspace.
   *
   * Example: `C:\MyRepo\common\subspaces\my-subspace\common-versions.json`
   * @beta
   */
  public getCommonVersionsFilePath(): string {
    return this._ensureDetail().subspaceConfigFolder + '/' + RushConstants.commonVersionsFilename;
  }

  /**
   * Gets the settings from the common-versions.json config file.
   * @beta
   */
  public getCommonVersions(): CommonVersionsConfiguration {
    const commonVersionsFilename: string = this.getCommonVersionsFilePath();
    if (!this._commonVersionsConfiguration) {
      this._commonVersionsConfiguration = CommonVersionsConfiguration.loadFromFile(commonVersionsFilename);
    }
    return this._commonVersionsConfiguration;
  }

  /**
   * Gets the path to the repo-state.json file.
   * @beta
   */
  public getRepoStateFilePath(): string {
    return this._ensureDetail().subspaceConfigFolder + '/' + RushConstants.repoStateFilename;
  }

  /**
   * Gets the contents from the repo-state.json file.
   * @param subspaceName - The name of the subspace in use by the active command.
   * @beta
   */
  public getRepoState(): RepoStateFile {
    const repoStateFilename: string = this.getRepoStateFilePath();
    return RepoStateFile.loadFromFile(repoStateFilename);
  }

  /**
   * Gets the committed shrinkwrap file name.
   * @beta
   */
  public getCommittedShrinkwrapFilename(): string {
    const subspaceConfigFolderPath: string = this.getSubspaceConfigFolder();
    return path.join(subspaceConfigFolderPath, this._rushConfiguration.shrinkwrapFilename);
  }

  /**
   * Gets the absolute path for "pnpmfile.js" for a specific subspace.
   * @param subspace - The name of the current subspace in use by the active command.
   * @remarks
   * The file path is returned even if PNPM is not configured as the package manager.
   * @beta
   */
  public getPnpmfilePath(): string {
    const subspaceConfigFolderPath: string = this.getSubspaceConfigFolder();

    let pnpmFilename: string = (this._rushConfiguration.packageManagerWrapper as PnpmPackageManager)
      .pnpmfileFilename;
    if (this._rushConfiguration.subspacesFeatureEnabled) {
      pnpmFilename = (this._rushConfiguration.packageManagerWrapper as PnpmPackageManager)
        .subspacePnpmfileFilename;
    }

    return path.join(subspaceConfigFolderPath, pnpmFilename);
  }

  /**
   * Returns true if the specified project belongs to this subspace.
   * @beta
   */
  public contains(project: RushConfigurationProject): boolean {
    return project.subspace.subspaceName === this.subspaceName;
  }

  /** @internal */
  public _addProject(project: RushConfigurationProject): void {
    this._projects.push(project);
  }
}
