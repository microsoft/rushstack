// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as fsx from 'fs-extra';
import * as semver from 'semver';
import { cloneDeep } from 'lodash';

import {
  ChangeFile,
  ChangeType,
  IChangeInfo,
  RushConfiguration,
  RushConfigurationProject,
  RushConstants,
  VersionPolicyConfiguration,
  IPackageJson,
  VersionPolicy
} from '@microsoft/rush-lib';

import PublishUtilities from './PublishUtilities';
import ChangeManager from './ChangeManager';
import ChangelogGenerator from './ChangelogGenerator';

export class VersionManager {
  private _versionPolicyConfiguration: VersionPolicyConfiguration;

  constructor(private _rushConfiguration: RushConfiguration,
    _versionPolicyConfiguration?: VersionPolicyConfiguration
  ) {
    this._versionPolicyConfiguration = _versionPolicyConfiguration ?
      _versionPolicyConfiguration : this._rushConfiguration.versionPolicyConfiguration;
  }

  /**
   * Ensures project versions follow the provided version policy. If version policy is not
   * provided, all projects will have their version checked according to the associated version policy.
   * package.json files will be updated if needed.
   * This method does not commit changes.
   * @param versionPolicyName -- version policy name
   * @param shouldCommit -- should update files to disk
   */
  public ensure(versionPolicyName?: string, shouldCommit?: boolean): Map<string, IPackageJson> {
    const updatedProjects: Map<string, IPackageJson> = new Map<string, IPackageJson>();
    this._updateVersionsByPolicy(updatedProjects, versionPolicyName);

    // Update all dependencies if needed.
    this._updateDependencies(updatedProjects);

    if (shouldCommit) {
      this._updateFiles(updatedProjects);
    }
    return updatedProjects;
  }

  public bump(versionPolicyName?: string, shouldCommit?: boolean): Map<string, IPackageJson> {
    this._versionPolicyConfiguration.bump(versionPolicyName, shouldCommit);

    const allUpdatedPackages: Map<string, IPackageJson> = new Map<string, IPackageJson>();
    // Update all projects based on lock step policies
    this._updateVersionsByPolicy(allUpdatedPackages, versionPolicyName);

    // Create change files for other effected projects
    const changeFiles: ChangeFile[] = this._updateDependencies(allUpdatedPackages);

    if (shouldCommit) {
      this._updateFiles(allUpdatedPackages);
      changeFiles.forEach((changeFile) => {
        changeFile.writeSync();
      });
    }

    // Update projects based on individual policies
    // TODO: make ChangeManager only handles projects that are with individual version policy
    // const changeManager: ChangeManager = new ChangeManager(this._rushConfiguration);
    // const changesPath: string = path.join(this._rushConfiguration.commonFolder, RushConstants.changeFilesFolderName);
    // changeManager.load(changesPath);
    // if (changeManager.hasChanges()) {
    //   changeManager.apply(shouldCommit).forEach(packageJson => {
    //     allUpdatedPackages.set(packageJson.name, packageJson);
    //   });
    // }
    return allUpdatedPackages;
  }

  private _updateVersionsByPolicy(
    updatedProjects: Map<string, IPackageJson>,
    versionPolicyName?: string
  ): void {
    const versionPolicies: Map<string, VersionPolicy> = this._versionPolicyConfiguration.versionPolicies;

    // Update versions based on version policy
    this._rushConfiguration.projects.forEach(rushProject => {
      const projectVersionPolicyName: string = rushProject.versionPolicyName;
      if (projectVersionPolicyName &&
          (!versionPolicyName || projectVersionPolicyName === versionPolicyName)) {
        const versionPolicy: VersionPolicy = this._versionPolicyConfiguration.getVersionPolicy(
          projectVersionPolicyName);
        const updatedProject: IPackageJson = versionPolicy.ensure(rushProject.packageJson);
        if (updatedProject) {
          updatedProjects.set(updatedProject.name, updatedProject);
        }
      }
    });
  }

  private _updateDependencies(updatedProjects: Map<string, IPackageJson>,
    createChangeFile?: boolean
  ): ChangeFile[] {
    const changeFiles: ChangeFile[] = [];
    this._rushConfiguration.projects.forEach(rushProject => {
      let clonedProject: IPackageJson = updatedProjects.get(rushProject.packageName);
      if (!clonedProject) {
        clonedProject = cloneDeep(rushProject.packageJson);
      }
      const changeFile: ChangeFile | undefined = this._updateProjectAllDependencies(rushProject,
        clonedProject, updatedProjects);
      if (changeFile) {
        changeFiles.push(changeFile);
      }
    });
    return changeFiles;
  }

  private _updateProjectAllDependencies(
    rushProject: RushConfigurationProject,
    clonedProject: IPackageJson,
    updatedProjects: Map<string, IPackageJson>
  ): ChangeFile | undefined {
    if (!clonedProject.dependencies) {
      return;
    }
    const dependencies: { [key: string]: string; } = clonedProject.dependencies;
    const changes: IChangeInfo[] = [];

    this._updateProjectDependencies(clonedProject.dependencies, changes,
      clonedProject.name, updatedProjects, rushProject);
    this._updateProjectDependencies(clonedProject.devDependencies, changes,
      clonedProject.name, updatedProjects, rushProject);

    if (changes.length > 0) {
      updatedProjects.set(clonedProject.name, clonedProject);
      const changeFile: ChangeFile = new ChangeFile({
        changes: changes,
        packageName: clonedProject.name,
        email: 'version_bump@microsoft.com'
      }, this._rushConfiguration);
      return changeFile;
    }
    return undefined;
  }

  private _updateProjectDependencies(dependencies: { [key: string]: string; },
    changes: IChangeInfo[],
    projectName: string,
    updatedProjects: Map<string, IPackageJson>,
    rushProject: RushConfigurationProject
  ): void {
    if (!dependencies) {
      return;
    }
    updatedProjects.forEach((updatedProject, updatedProjectName) => {
      if (dependencies[updatedProjectName]) {
        if (rushProject.cyclicDependencyProjects.has(updatedProjectName)) {
          // Skip if cyclic
          console.log(`Found cyclic ${rushProject.packageName} ${updatedProjectName}`);
          return;
        }
        const newDependencyVersion: string = PublishUtilities.getNewDependencyVersion(
            dependencies,
            updatedProjectName,
            updatedProject.version
          );
        if (newDependencyVersion !== dependencies[updatedProjectName]) {
          dependencies[updatedProjectName] = newDependencyVersion;
          changes.push(
            {
              changeType: ChangeType.dependency,
              comment: `Dependency ${updatedProjectName} version bump from ${dependencies[updatedProjectName]}` +
                ` to ${newDependencyVersion}.`,
              packageName: projectName
            }
          );
        }
      }
    });
  }

  private _updateFiles(updatedPackages: Map<string, IPackageJson>): void {
    updatedPackages.forEach((newPackageJson, packageName) => {
      const rushProject: RushConfigurationProject = this._rushConfiguration.getProjectByName(packageName);
      // Update package.json
      const packagePath: string = path.join(rushProject.projectFolder, 'package.json');
      fsx.writeFileSync(packagePath, JSON.stringify(newPackageJson, undefined, 2), 'utf8');

      if (newPackageJson.version !== rushProject.packageJson.version) {
        // If package version changes, add an entry to changelog
        const change: IChangeInfo = this._createChangeInfo(newPackageJson, rushProject);
        ChangelogGenerator.updateIndividualChangelog(change,
          rushProject.projectFolder,
          true);
      }
      // TODO: if only package dependency changes, add change file.
    });
  }

  private _createChangeInfo(newPackageJson: IPackageJson,
    rushProject: RushConfigurationProject
  ): IChangeInfo {
    const changeType: ChangeType = this._getChangeType(rushProject.packageJson.version,
      newPackageJson.version);
    // TODO: need to absorb all existing change files
    return {
      changeType: changeType,
      newVersion: newPackageJson.version,
      packageName: newPackageJson.name,
      changes: [
        {
          changeType: changeType,
          comment: `Version bump to ${newPackageJson.version}`,
          newVersion: newPackageJson.version,
          packageName: newPackageJson.name
        }
      ]
    };
  }

  private _getChangeType(oldVersionString: string, newVersionString: string): ChangeType {
    const diff: string = semver.diff(oldVersionString, newVersionString);
    let changeType: ChangeType = ChangeType.none;
    if (diff === 'major') {
      changeType = ChangeType.major;
    } else if (diff === 'minor') {
      changeType = ChangeType.minor;
    } else if (diff === 'patch') {
      changeType = ChangeType.patch;
    }
    return changeType;
  }

}