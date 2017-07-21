// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as semver from 'semver';
import * as fsx from 'fs-extra';
import { cloneDeep } from 'lodash';

import {
  ChangeFile,
  ChangeType,
  IChangeInfo,
  LockStepVersionPolicy,
  RushConfiguration,
  RushConfigurationProject,
  RushConstants,
  VersionPolicyConfiguration,
  IPackageJson,
  VersionPolicy
} from '@microsoft/rush-lib';

import PublishUtilities from './PublishUtilities';
import ChangeManager from './ChangeManager';

export class VersionManager {
  private _versionPolicyConfiguration: VersionPolicyConfiguration;
  private _updatedProjects: Map<string, IPackageJson>;
  private _changeFiles: Map<string, ChangeFile>;

  constructor(private _rushConfiguration: RushConfiguration,
    _versionPolicyConfiguration?: VersionPolicyConfiguration
  ) {
    this._versionPolicyConfiguration = _versionPolicyConfiguration ?
      _versionPolicyConfiguration : this._rushConfiguration.versionPolicyConfiguration;

    this._updatedProjects = new Map<string, IPackageJson>();
    this._changeFiles = new Map<string, ChangeFile>();
  }

  /**
   * Ensures project versions follow the provided version policy. If version policy is not
   * provided, all projects will have their version checked according to the associated version policy.
   * package.json files will be updated if needed.
   * This method does not commit changes.
   * @param versionPolicyName -- version policy name
   * @param shouldCommit -- should update files to disk
   */
  public ensure(versionPolicyName?: string, shouldCommit?: boolean): void {
    this._ensure(versionPolicyName, shouldCommit);
  }

  public bump(versionPolicyName?: string, shouldCommit?: boolean): void {
    // Bump all the lock step version policies.
    this._versionPolicyConfiguration.bump(versionPolicyName, shouldCommit);

    // Update packages and generate change files due to lock step bump.
    this._ensure(versionPolicyName, shouldCommit);

    // Refresh rush configuration
    this._rushConfiguration = RushConfiguration.loadFromConfigurationFile(this._rushConfiguration.rushJsonFile);

    // Update projects based on individual policies
    const changeManager: ChangeManager = new ChangeManager(this._rushConfiguration,
      this._getLockStepProjects());
    const changesPath: string = path.join(this._rushConfiguration.commonFolder, RushConstants.changeFilesFolderName);
    changeManager.load(changesPath);
    if (changeManager.hasChanges()) {
      changeManager.validateChanges(this._versionPolicyConfiguration);
      changeManager.apply(shouldCommit).forEach(packageJson => {
        this._updatedProjects.set(packageJson.name, packageJson);
      });
    }
  }

  public get updatedProjects(): Map<string, IPackageJson> {
    return this._updatedProjects;
  }

  public get changeFiles(): Map<string, ChangeFile> {
    return this._changeFiles;
  }

  private _ensure(versionPolicyName?: string, shouldCommit?: boolean): void {
    this._updateVersionsByPolicy(versionPolicyName);

    // Update all dependencies if needed.
    this._updateDependencies();

    if (shouldCommit) {
      this._updatePackageJsonFiles();
      this._changeFiles.forEach((changeFile) => {
        changeFile.writeSync();
      });
    }
  }

  private _getLockStepProjects(): Set<string> | undefined {
    const lockStepVersionPolicyNames: Set<string> = new Set<string>();

    this._versionPolicyConfiguration.versionPolicies.forEach((versionPolicy) => {
      if (versionPolicy instanceof LockStepVersionPolicy) {
        lockStepVersionPolicyNames.add(versionPolicy.policyName);
      }
    });
    const lockStepProjectNames: Set<string> = new Set<string>();
    this._rushConfiguration.projects.forEach((rushProject) => {
      if (lockStepVersionPolicyNames.has(rushProject.versionPolicyName)) {
        lockStepProjectNames.add(rushProject.packageName);
      }
    });
    return lockStepProjectNames;
  }

  private _updateVersionsByPolicy(versionPolicyName?: string): void {
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
          this._updatedProjects.set(updatedProject.name, updatedProject);
          this._addChangeInfo(updatedProject.name,
            [this._createChangeInfo(updatedProject, rushProject)]);
        }
      }
    });
  }

  private _addChangeInfo(packageName: string,
    changeInfos: IChangeInfo[]
  ): void {
    if (!changeInfos.length) {
      return;
    }
    let changeFile: ChangeFile = this._changeFiles.get(packageName);
    if (!changeFile) {
      changeFile = new ChangeFile({
        changes: [],
        packageName: packageName,
        email: 'version_bump@microsoft.com'
      }, this._rushConfiguration);
      this._changeFiles.set(packageName, changeFile);
    }
    changeInfos.forEach((changeInfo) => {
      changeFile.addChange(changeInfo);
    });
  }

  private _updateDependencies(): void {
    this._rushConfiguration.projects.forEach(rushProject => {
      let clonedProject: IPackageJson = this._updatedProjects.get(rushProject.packageName);
      if (!clonedProject) {
        clonedProject = cloneDeep(rushProject.packageJson);
      }
      this._updateProjectAllDependencies(rushProject, clonedProject);
    });
  }

  private _updateProjectAllDependencies(
    rushProject: RushConfigurationProject,
    clonedProject: IPackageJson
  ): void {
    if (!clonedProject.dependencies) {
      return;
    }
    const dependencies: { [key: string]: string; } = clonedProject.dependencies;
    const changes: IChangeInfo[] = [];
    let updated: boolean = false;
    if (this._updateProjectDependencies(clonedProject.dependencies, changes,
      clonedProject.name, this._updatedProjects, rushProject)
    ) {
      updated = true;
    }
    if (this._updateProjectDependencies(clonedProject.devDependencies, changes,
      clonedProject.name, this._updatedProjects, rushProject)
    ) {
      updated = true;
    }

    if (updated) {
      this._updatedProjects.set(clonedProject.name, clonedProject);

      this._addChangeInfo(clonedProject.name, changes);
    }
  }

  private _updateProjectDependencies(dependencies: { [key: string]: string; },
    changes: IChangeInfo[],
    projectName: string,
    updatedProjects: Map<string, IPackageJson>,
    rushProject: RushConfigurationProject
  ): boolean {
    if (!dependencies) {
      return false;
    }
    let updated: boolean = false;
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
          updated = true;
          if (rushProject.shouldPublish) {
            if (!semver.satisfies(updatedProject.version, dependencies[updatedProjectName])) {
              changes.push(
                {
                  changeType: ChangeType.patch,
                  packageName: projectName
                }
              );
            }

            changes.push(
              {
                changeType: ChangeType.dependency,
                comment: `Dependency ${updatedProjectName} version bump from ${dependencies[updatedProjectName]}` +
                  ` to ${newDependencyVersion}.`,
                packageName: projectName
              }
            );
          }
          dependencies[updatedProjectName] = newDependencyVersion;
        }
      }
    });
    return updated;
  }

  private _updatePackageJsonFiles(): void {
    this._updatedProjects.forEach((newPackageJson, packageName) => {
      const rushProject: RushConfigurationProject = this._rushConfiguration.getProjectByName(packageName);
      // Update package.json
      const packagePath: string = path.join(rushProject.projectFolder, 'package.json');
      fsx.writeFileSync(packagePath, JSON.stringify(newPackageJson, undefined, 2), 'utf8');
    });
  }

  private _createChangeInfo(newPackageJson: IPackageJson,
    rushProject: RushConfigurationProject
  ): IChangeInfo {
    return {
      changeType: ChangeType.none,
      newVersion: newPackageJson.version,
      packageName: newPackageJson.name,
      changes: [
        {
          changeType: ChangeType.none,
          comment: `Package version bump from ${rushProject.packageJson.version} to ${newPackageJson.version}`,
          newVersion: newPackageJson.version,
          packageName: newPackageJson.name
        }
      ]
    };
  }

}