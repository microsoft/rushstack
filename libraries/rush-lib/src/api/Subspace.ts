// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as crypto from 'crypto';

import { FileSystem } from '@rushstack/node-core-library';
import type { RushConfiguration } from './RushConfiguration';
import type { RushConfigurationProject } from './RushConfigurationProject';
import { EnvironmentConfiguration } from './EnvironmentConfiguration';
import { RushConstants } from '../logic/RushConstants';
import { CommonVersionsConfiguration } from './CommonVersionsConfiguration';
import { RepoStateFile } from '../logic/RepoStateFile';
import type { PnpmPackageManager } from './packageManager/PnpmPackageManager';
import { PnpmOptionsConfiguration } from '../logic/pnpm/PnpmOptionsConfiguration';
import type { IPackageJson } from '@rushstack/node-core-library';
import { SubspacePnpmfileConfiguration } from '../logic/pnpm/SubspacePnpmfileConfiguration';
import type { ISubspacePnpmfileShimSettings } from '../logic/pnpm/IPnpmfile';

/**
 * @internal
 */
export interface ISubspaceOptions {
  subspaceName: string;
  rushConfiguration: RushConfiguration;
  splitWorkspaceCompatibility: boolean;
}

interface ISubspaceDetail {
  subspaceConfigFolderPath: string;
  subspacePnpmPatchesFolderPath: string;
  subspaceTempFolderPath: string;
  tempShrinkwrapFilename: string;
  tempShrinkwrapPreinstallFilename: string;
}

interface IPackageJsonLite extends Omit<IPackageJson, 'version'> {}

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
      // Calculate these outside the try/catch block since their error messages shouldn't be annotated:
      const subspaceConfigFolder: string = this.getSubspaceConfigFolderPath();
      const subspaceTempFolder: string = this.getSubspaceTempFolderPath();
      try {
        this._cachedPnpmOptions = PnpmOptionsConfiguration.loadFromJsonFileOrThrow(
          `${subspaceConfigFolder}/${RushConstants.pnpmConfigFilename}`,
          subspaceTempFolder
        );
        this._cachedPnpmOptionsInitialized = true;
      } catch (e) {
        if (FileSystem.isNotExistError(e as Error)) {
          this._cachedPnpmOptions = undefined;
          this._cachedPnpmOptionsInitialized = true;
        } else {
          throw new Error(
            `The subspace "${this.subspaceName}" has an invalid pnpm-config.json file:\n` + e.message
          );
        }
      }
    }
    return this._cachedPnpmOptions;
  }

  private _ensureDetail(): ISubspaceDetail {
    if (!this._detail) {
      const rushConfiguration: RushConfiguration = this._rushConfiguration;
      let subspaceConfigFolderPath: string;
      let subspacePnpmPatchesFolderPath: string;

      if (rushConfiguration.subspacesFeatureEnabled) {
        if (!rushConfiguration.pnpmOptions.useWorkspaces) {
          throw new Error(
            `The Rush subspaces feature is enabled.  You must set useWorkspaces=true in pnpm-config.json.`
          );
        }

        // If this subspace doesn't have a configuration folder, check if it is in the project folder itself
        // if the splitWorkspaceCompatibility option is enabled in the subspace configuration

        // Example: C:\MyRepo\common\config\subspaces\my-subspace
        const standardSubspaceConfigFolder: string = `${rushConfiguration.commonFolder}/config/subspaces/${this.subspaceName}`;

        subspaceConfigFolderPath = standardSubspaceConfigFolder;

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

          subspaceConfigFolderPath = `${project.projectFolder}/subspace/${this.subspaceName}`;

          // Ensure that this project does not have it's own pnpmfile.cjs or .npmrc file
          if (FileSystem.exists(`${project.projectFolder}/.npmrc`)) {
            throw new Error(
              `The project level configuration file ${project.projectFolder}/.npmrc is no longer valid. Please use a ${subspaceConfigFolderPath}/.npmrc file instead.`
            );
          }
          if (FileSystem.exists(`${project.projectFolder}/.pnpmfile.cjs`)) {
            throw new Error(
              `The project level configuration file ${project.projectFolder}/.pnpmfile.cjs is no longer valid. Please use a ${subspaceConfigFolderPath}/.pnpmfile.cjs file instead.`
            );
          }
        }

        if (!FileSystem.exists(subspaceConfigFolderPath)) {
          throw new Error(
            `The configuration folder for the "${this.subspaceName}" subspace does not exist: ` +
              subspaceConfigFolderPath
          );
        }

        subspacePnpmPatchesFolderPath = `${subspaceConfigFolderPath}/${RushConstants.pnpmPatchesCommonFolderName}`;
      } else {
        // Example: C:\MyRepo\common\config\rush
        subspaceConfigFolderPath = rushConfiguration.commonRushConfigFolder;
        // Example: C:\MyRepo\common\pnpm-patches
        subspacePnpmPatchesFolderPath = `${rushConfiguration.commonFolder}/${RushConstants.pnpmPatchesCommonFolderName}`;
      }

      // Example: C:\MyRepo\common\temp
      const commonTempFolder: string =
        EnvironmentConfiguration.rushTempFolderOverride || rushConfiguration.commonTempFolder;

      let subspaceTempFolderPath: string;
      if (rushConfiguration.subspacesFeatureEnabled) {
        // Example: C:\MyRepo\common\temp\my-subspace
        subspaceTempFolderPath = path.join(commonTempFolder, this.subspaceName);
      } else {
        // Example: C:\MyRepo\common\temp
        subspaceTempFolderPath = commonTempFolder;
      }

      // Example: C:\MyRepo\common\temp\my-subspace\pnpm-lock.yaml
      const tempShrinkwrapFilename: string =
        subspaceTempFolderPath + `/${rushConfiguration.shrinkwrapFilename}`;

      /// From "C:\MyRepo\common\temp\pnpm-lock.yaml" --> "C:\MyRepo\common\temp\pnpm-lock-preinstall.yaml"
      const parsedPath: path.ParsedPath = path.parse(tempShrinkwrapFilename);
      const tempShrinkwrapPreinstallFilename: string = path.join(
        parsedPath.dir,
        parsedPath.name + '-preinstall' + parsedPath.ext
      );

      this._detail = {
        subspaceConfigFolderPath,
        subspacePnpmPatchesFolderPath,
        subspaceTempFolderPath,
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
  public getSubspaceConfigFolderPath(): string {
    return this._ensureDetail().subspaceConfigFolderPath;
  }

  /**
   * Returns the full path of the folder containing this subspace's configuration files such as `pnpm-lock.yaml`.
   *
   * Example: `common/config/subspaces/my-subspace/pnpm-patches` (subspaces feature enabled)
   * Example: `common/config/pnpm-patches` (subspaces feature disabled)
   * @beta
   */
  public getSubspacePnpmPatchesFolderPath(): string {
    return this._ensureDetail().subspacePnpmPatchesFolderPath;
  }

  /**
   * The folder where the subspace's node_modules and other temporary files will be stored.
   *
   * Example: `common/temp/subspaces/my-subspace`
   * @beta
   */
  public getSubspaceTempFolderPath(): string {
    return this._ensureDetail().subspaceTempFolderPath;
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
    return this._ensureDetail().subspaceConfigFolderPath + '/' + RushConstants.commonVersionsFilename;
  }

  /**
   * Gets the path to the pnpm-config.json config file for this subspace.
   *
   * Example: `C:\MyRepo\common\subspaces\my-subspace\pnpm-config.json`
   * @beta
   */
  public getPnpmConfigFilePath(): string {
    return this._ensureDetail().subspaceConfigFolderPath + '/' + RushConstants.pnpmConfigFilename;
  }

  /**
   * Gets the settings from the common-versions.json config file.
   * @beta
   */
  public getCommonVersions(): CommonVersionsConfiguration {
    const commonVersionsFilename: string = this.getCommonVersionsFilePath();
    if (!this._commonVersionsConfiguration) {
      this._commonVersionsConfiguration = CommonVersionsConfiguration.loadFromFile(
        commonVersionsFilename,
        this._rushConfiguration
      );
    }
    return this._commonVersionsConfiguration;
  }

  /**
   * Gets the ensureConsistentVersions property from the common-versions.json config file,
   * or from the rush.json file if it isn't defined in common-versions.json
   * @beta
   */
  public get shouldEnsureConsistentVersions(): boolean {
    // If the subspaces feature is enabled, or the ensureConsistentVersions field is defined, return the value of the field
    if (
      this._rushConfiguration.subspacesFeatureEnabled ||
      this.getCommonVersions().ensureConsistentVersions !== undefined
    ) {
      return !!this.getCommonVersions().ensureConsistentVersions;
    }

    // Fallback to ensureConsistentVersions in rush.json if subspaces is not enabled,
    // or if the setting is not defined in the common-versions.json file
    return this._rushConfiguration.ensureConsistentVersions;
  }

  /**
   * Gets the path to the repo-state.json file.
   * @beta
   */
  public getRepoStateFilePath(): string {
    return this._ensureDetail().subspaceConfigFolderPath + '/' + RushConstants.repoStateFilename;
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
    const subspaceConfigFolderPath: string = this.getSubspaceConfigFolderPath();
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
    const subspaceConfigFolderPath: string = this.getSubspaceConfigFolderPath();

    const pnpmFilename: string = (this._rushConfiguration.packageManagerWrapper as PnpmPackageManager)
      .pnpmfileFilename;

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

  /**
   * Returns hash value of injected dependencies in related package.json.
   * @beta
   */
  public getPackageJsonInjectedDependenciesHash(): string | undefined {
    const allPackageJson: IPackageJsonLite[] = [];

    const relatedProjects: RushConfigurationProject[] = [];
    const subspacePnpmfileShimSettings: ISubspacePnpmfileShimSettings =
      SubspacePnpmfileConfiguration.getSubspacePnpmfileShimSettings(this._rushConfiguration, this);

    for (const rushProject of this.getProjects()) {
      const injectedDependencies: Array<string> =
        subspacePnpmfileShimSettings?.subspaceProjects[rushProject.packageName]?.injectedDependencies || [];
      if (injectedDependencies.length === 0) {
        continue;
      }

      const injectedDependencySet: Set<string> = new Set(injectedDependencies);

      for (const dependencyProject of rushProject.dependencyProjects) {
        if (injectedDependencySet.has(dependencyProject.packageName)) {
          relatedProjects.push(dependencyProject);
        }
      }
    }

    // this means no injected dependencies found for current subspace
    if (relatedProjects.length === 0) {
      return undefined;
    }

    const allWorkspaceProjectSet: Set<string> = new Set(
      this._rushConfiguration.projects.map((rushProject) => rushProject.packageName)
    );

    // get all related package.json
    while (relatedProjects.length > 0) {
      const rushProject: RushConfigurationProject = relatedProjects.pop()!;
      // collect fields that could update the `pnpm-lock.yaml`
      const {
        name,
        bin,
        dependencies,
        devDependencies,
        peerDependencies,
        optionalDependencies,
        dependenciesMeta,
        peerDependenciesMeta,
        resolutions
      } = rushProject.packageJson;

      // special handing for peerDependencies
      // for workspace packages, the version range is meaningless here.
      if (peerDependencies) {
        for (const packageName of Object.keys(peerDependencies)) {
          if (allWorkspaceProjectSet.has(packageName)) {
            peerDependencies[packageName] = 'workspace:*';
          }
        }
      }

      allPackageJson.push({
        name,
        bin,
        dependencies,
        devDependencies,
        peerDependencies,
        optionalDependencies,
        dependenciesMeta,
        peerDependenciesMeta,
        resolutions
      });

      relatedProjects.push(...rushProject.dependencyProjects);
    }

    const collator: Intl.Collator = new Intl.Collator('en');
    allPackageJson.sort((pa, pb) => collator.compare(pa.name, pb.name));
    const hash: crypto.Hash = crypto.createHash('sha1');
    for (const packageFile of allPackageJson) {
      hash.update(JSON.stringify(packageFile));
    }

    const packageJsonInjectedDependenciesHash: string = hash.digest('hex');

    return packageJsonInjectedDependenciesHash;
  }
}
