// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as semver from 'semver';
import { type IPackageJson, JsonFile, FileConstants } from '@rushstack/node-core-library';

import { type VersionPolicy, type BumpType, LockStepVersionPolicy } from '../api/VersionPolicy';
import { ChangeFile } from '../api/ChangeFile';
import { ChangeType, type IChangeInfo } from '../api/ChangeManagement';
import { RushConfiguration } from '../api/RushConfiguration';
import type { RushConfigurationProject } from '../api/RushConfigurationProject';
import type { VersionPolicyConfiguration } from '../api/VersionPolicyConfiguration';
import { PublishUtilities } from './PublishUtilities';
import { ChangeManager } from './ChangeManager';
import { DependencySpecifier } from './DependencySpecifier';
import { cloneDeep } from '../utilities/objectUtilities';

export class VersionManager {
  private _rushConfiguration: RushConfiguration;
  private _userEmail: string;
  private _versionPolicyConfiguration: VersionPolicyConfiguration;

  public readonly updatedProjects: Map<string, IPackageJson>;
  public readonly changeFiles: Map<string, ChangeFile>;

  public constructor(
    rushConfiguration: RushConfiguration,
    userEmail: string,
    versionPolicyConfiguration: VersionPolicyConfiguration
  ) {
    this._rushConfiguration = rushConfiguration;
    this._userEmail = userEmail;
    this._versionPolicyConfiguration = versionPolicyConfiguration
      ? versionPolicyConfiguration
      : this._rushConfiguration.versionPolicyConfiguration;

    this.updatedProjects = new Map<string, IPackageJson>();
    this.changeFiles = new Map<string, ChangeFile>();
  }

  /**
   * Ensures project versions follow the provided version policy. If version policy is not
   * provided, all projects will have their version checked according to the associated version policy.
   * package.json files will be updated if needed.
   * This method does not commit changes.
   * @param versionPolicyName -- version policy name
   * @param shouldCommit -- should update files to disk
   * @param force -- update even when project version is higher than policy version.
   */
  public ensure(versionPolicyName?: string, shouldCommit?: boolean, force?: boolean): void {
    this._ensure(versionPolicyName, shouldCommit, force);
  }

  /**
   * Bumps versions following version policies.
   *
   * @param lockStepVersionPolicyName - a specified lock step version policy name. Without this value,
   * versions for all lock step policies and all individual policies will be bumped.
   * With this value, only the specified lock step policy will be bumped along with all individual policies.
   * @param bumpType - overrides the default bump type and only works for lock step policy
   * @param identifier - overrides the prerelease identifier and only works for lock step policy
   * @param shouldCommit - whether the changes will be written to disk
   */
  public async bumpAsync(
    lockStepVersionPolicyName?: string,
    bumpType?: BumpType,
    identifier?: string,
    shouldCommit?: boolean
  ): Promise<void> {
    // Bump all the lock step version policies.
    this._versionPolicyConfiguration.bump(lockStepVersionPolicyName, bumpType, identifier, shouldCommit);

    // Update packages and generate change files due to lock step bump.
    this._ensure(lockStepVersionPolicyName, shouldCommit);

    // Refresh rush configuration since we may have modified the package.json versions
    // when calling this._ensure(...)
    this._rushConfiguration = RushConfiguration.loadFromConfigurationFile(
      this._rushConfiguration.rushJsonFile
    );

    // Update projects based on individual policies
    const changeManager: ChangeManager = new ChangeManager(
      this._rushConfiguration,
      this._getManuallyVersionedProjects()
    );

    await changeManager.loadAsync(this._rushConfiguration.changesFolder);
    if (changeManager.hasChanges()) {
      changeManager.validateChanges(this._versionPolicyConfiguration);
      changeManager.apply(!!shouldCommit)!.forEach((packageJson) => {
        this.updatedProjects.set(packageJson.name, packageJson);
      });
      await changeManager.updateChangelogAsync(!!shouldCommit);
    }

    // Refresh rush configuration again, since we've further modified the package.json files
    // by calling changeManager.apply(...)
    this._rushConfiguration = RushConfiguration.loadFromConfigurationFile(
      this._rushConfiguration.rushJsonFile
    );
  }

  private _ensure(versionPolicyName?: string, shouldCommit?: boolean, force?: boolean): void {
    this._updateVersionsByPolicy(versionPolicyName, force);

    let changed: boolean = false;
    do {
      changed = false;
      // Update all dependencies if needed.
      const dependenciesUpdated: boolean = this._updateDependencies();
      changed = changed || dependenciesUpdated;
    } while (changed);

    if (shouldCommit) {
      this._updatePackageJsonFiles();
      this.changeFiles.forEach((changeFile) => {
        changeFile.writeSync();
      });
    }
  }

  private _getManuallyVersionedProjects(): Set<string> | undefined {
    const lockStepVersionPolicyNames: Set<string> = new Set<string>();

    this._versionPolicyConfiguration.versionPolicies.forEach((versionPolicy) => {
      if (versionPolicy instanceof LockStepVersionPolicy && versionPolicy.nextBump !== undefined) {
        lockStepVersionPolicyNames.add(versionPolicy.policyName);
      }
    });
    const lockStepProjectNames: Set<string> = new Set<string>();
    this._rushConfiguration.projects.forEach((rushProject) => {
      if (lockStepVersionPolicyNames.has(rushProject.versionPolicyName!)) {
        lockStepProjectNames.add(rushProject.packageName);
      }
    });
    return lockStepProjectNames;
  }

  private _updateVersionsByPolicy(versionPolicyName?: string, force?: boolean): boolean {
    let changed: boolean = false;

    // Update versions based on version policy
    this._rushConfiguration.projects.forEach((rushProject) => {
      const projectVersionPolicyName: string | undefined = rushProject.versionPolicyName;
      if (
        projectVersionPolicyName &&
        (!versionPolicyName || projectVersionPolicyName === versionPolicyName)
      ) {
        const versionPolicy: VersionPolicy =
          this._versionPolicyConfiguration.getVersionPolicy(projectVersionPolicyName);

        const oldVersion: string =
          this.updatedProjects.get(rushProject.packageName)?.version || rushProject.packageJson.version;
        const updatedProject: IPackageJson | undefined = versionPolicy.ensure(rushProject.packageJson, force);
        changed = changed || updatedProject?.version !== oldVersion;

        if (updatedProject) {
          this.updatedProjects.set(updatedProject.name, updatedProject);
          // No need to create an entry for prerelease version bump.
          if (!this._isPrerelease(updatedProject.version) && rushProject.isMainProject) {
            this._addChangeInfo(updatedProject.name, [this._createChangeInfo(updatedProject, rushProject)]);
          }
        }
      }
    });

    return changed;
  }

  private _isPrerelease(version: string): boolean {
    return !!semver.prerelease(version);
  }

  private _addChangeInfo(packageName: string, changeInfos: IChangeInfo[]): void {
    if (!changeInfos.length) {
      return;
    }
    let changeFile: ChangeFile | undefined = this.changeFiles.get(packageName);
    if (!changeFile) {
      changeFile = new ChangeFile(
        {
          changes: [],
          packageName: packageName,
          email: this._userEmail
        },
        this._rushConfiguration
      );
      this.changeFiles.set(packageName, changeFile);
    }
    changeInfos.forEach((changeInfo) => {
      changeFile!.addChange(changeInfo);
    });
  }

  private _updateDependencies(): boolean {
    let updated: boolean = false;

    this._rushConfiguration.projects.forEach((rushProject) => {
      let clonedProject: IPackageJson | undefined = this.updatedProjects.get(rushProject.packageName);
      let projectVersionChanged: boolean = true;

      if (!clonedProject) {
        clonedProject = cloneDeep(rushProject.packageJson);
        projectVersionChanged = false;
      }

      const dependenciesUpdated: boolean = this._updateProjectAllDependencies(
        rushProject,
        clonedProject!,
        projectVersionChanged
      );

      updated = updated || dependenciesUpdated;
    });

    return updated;
  }

  private _updateProjectAllDependencies(
    rushProject: RushConfigurationProject,
    clonedProject: IPackageJson,
    projectVersionChanged: boolean
  ): boolean {
    if (!clonedProject.dependencies && !clonedProject.devDependencies) {
      return false;
    }
    const changes: IChangeInfo[] = [];
    let updated: boolean = false;
    if (
      this._updateProjectDependencies(
        clonedProject.dependencies,
        changes,
        clonedProject,
        rushProject,
        projectVersionChanged
      )
    ) {
      updated = true;
    }
    if (
      this._updateProjectDependencies(
        clonedProject.devDependencies,
        changes,
        clonedProject,
        rushProject,
        projectVersionChanged
      )
    ) {
      updated = true;
    }
    if (
      this._updateProjectDependencies(
        clonedProject.peerDependencies,
        changes,
        clonedProject,
        rushProject,
        projectVersionChanged
      )
    ) {
      updated = true;
    }

    if (updated) {
      this.updatedProjects.set(clonedProject.name, clonedProject);
      this._addChangeInfo(clonedProject.name, changes);
    }

    return updated;
  }

  private _updateProjectDependencies(
    dependencies: { [key: string]: string } | undefined,
    changes: IChangeInfo[],
    clonedProject: IPackageJson,
    rushProject: RushConfigurationProject,
    projectVersionChanged: boolean
  ): boolean {
    if (!dependencies) {
      return false;
    }
    let updated: boolean = false;
    this.updatedProjects.forEach((updatedDependentProject, updatedDependentProjectName) => {
      if (dependencies[updatedDependentProjectName]) {
        if (rushProject.decoupledLocalDependencies.has(updatedDependentProjectName)) {
          // Skip if cyclic
          // eslint-disable-next-line no-console
          console.log(`Found cyclic ${rushProject.packageName} ${updatedDependentProjectName}`);
          return;
        }

        const oldDependencyVersion: string = dependencies[updatedDependentProjectName];
        const newDependencyVersion: string = PublishUtilities.getNewDependencyVersion(
          dependencies,
          updatedDependentProjectName,
          updatedDependentProject.version
        );

        if (newDependencyVersion !== oldDependencyVersion) {
          updated = true;
          if (this._shouldTrackDependencyChange(rushProject, updatedDependentProjectName)) {
            this._trackDependencyChange(
              changes,
              clonedProject,
              projectVersionChanged,
              updatedDependentProject,
              oldDependencyVersion,
              newDependencyVersion
            );
          }
          dependencies[updatedDependentProjectName] = newDependencyVersion;
        }
      }
    });
    return updated;
  }

  private _shouldTrackDependencyChange(
    rushProject: RushConfigurationProject,
    dependencyName: string
  ): boolean {
    const dependencyRushProject: RushConfigurationProject | undefined =
      this._rushConfiguration.projectsByName.get(dependencyName);

    return (
      !!dependencyRushProject &&
      rushProject.shouldPublish &&
      (!rushProject.versionPolicy ||
        !rushProject.versionPolicy.isLockstepped ||
        (rushProject.isMainProject &&
          dependencyRushProject.versionPolicyName !== rushProject.versionPolicyName))
    );
  }

  private _trackDependencyChange(
    changes: IChangeInfo[],
    clonedProject: IPackageJson,
    projectVersionChanged: boolean,
    updatedDependentProject: IPackageJson,
    oldDependencyVersion: string,
    newDependencyVersion: string
  ): void {
    const oldSpecifier: DependencySpecifier = DependencySpecifier.parseWithCache(
      updatedDependentProject.name,
      oldDependencyVersion
    );
    if (
      !semver.satisfies(updatedDependentProject.version, oldSpecifier.versionSpecifier) &&
      !projectVersionChanged
    ) {
      this._addChange(changes, {
        changeType: ChangeType.patch,
        packageName: clonedProject.name
      });
    }

    // If current version is not a prerelease version and new dependency is also not a prerelease version,
    // add change entry. Otherwise, too many changes will be created for frequent releases.
    if (!this._isPrerelease(updatedDependentProject.version) && !this._isPrerelease(clonedProject.version)) {
      this._addChange(changes, {
        changeType: ChangeType.dependency,
        comment:
          `Dependency ${updatedDependentProject.name} version bump from ${oldDependencyVersion}` +
          ` to ${newDependencyVersion}.`,
        packageName: clonedProject.name
      });
    }
  }

  private _addChange(changes: IChangeInfo[], newChange: IChangeInfo): void {
    const exists: boolean = changes.some((changeInfo) => {
      return (
        changeInfo.author === newChange.author &&
        changeInfo.changeType === newChange.changeType &&
        changeInfo.comment === newChange.comment &&
        changeInfo.commit === newChange.commit &&
        changeInfo.packageName === newChange.packageName &&
        changeInfo.type === newChange.type
      );
    });
    if (!exists) {
      changes.push(newChange);
    }
  }

  private _updatePackageJsonFiles(): void {
    this.updatedProjects.forEach((newPackageJson, packageName) => {
      const rushProject: RushConfigurationProject | undefined =
        this._rushConfiguration.getProjectByName(packageName);
      // Update package.json
      if (rushProject) {
        const packagePath: string = path.join(rushProject.projectFolder, FileConstants.PackageJson);
        JsonFile.save(newPackageJson, packagePath, { updateExistingFile: true });
      }
    });
  }

  private _createChangeInfo(
    newPackageJson: IPackageJson,
    rushProject: RushConfigurationProject
  ): IChangeInfo {
    return {
      changeType: ChangeType.none,
      newVersion: newPackageJson.version,
      packageName: newPackageJson.name,
      comment: ''
    };
  }
}
