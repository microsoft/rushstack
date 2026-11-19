// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import * as semver from 'semver';

import { type IPackageJson, JsonFile, FileConstants } from '@rushstack/node-core-library';
import type { ITerminal } from '@rushstack/terminal';

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
  #rushConfiguration: RushConfiguration;
  #userEmail: string;
  #versionPolicyConfiguration: VersionPolicyConfiguration;

  public readonly updatedProjects: Map<string, IPackageJson>;
  public readonly changeFiles: Map<string, ChangeFile>;

  public constructor(
    rushConfiguration: RushConfiguration,
    userEmail: string,
    versionPolicyConfiguration: VersionPolicyConfiguration
  ) {
    this.#rushConfiguration = rushConfiguration;
    this.#userEmail = userEmail;
    this.#versionPolicyConfiguration = versionPolicyConfiguration
      ? versionPolicyConfiguration
      : this.#rushConfiguration.versionPolicyConfiguration;

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
    this.#ensure(versionPolicyName, shouldCommit, force);
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
    terminal: ITerminal,
    lockStepVersionPolicyName?: string,
    bumpType?: BumpType,
    identifier?: string,
    shouldCommit?: boolean
  ): Promise<void> {
    // Bump all the lock step version policies.
    this.#versionPolicyConfiguration.bump(lockStepVersionPolicyName, bumpType, identifier, shouldCommit);

    // Update packages and generate change files due to lock step bump.
    this.#ensure(lockStepVersionPolicyName, shouldCommit);

    // Refresh rush configuration since we may have modified the package.json versions
    // when calling this._ensure(...)
    this.#rushConfiguration = RushConfiguration.loadFromConfigurationFile(
      this.#rushConfiguration.rushJsonFile
    );

    // Update projects based on individual policies
    const changeManager: ChangeManager = new ChangeManager(
      this.#rushConfiguration,
      this.#getManuallyVersionedProjects()
    );

    await changeManager.loadAsync();
    if (changeManager.hasChanges()) {
      changeManager.validateChanges(this.#versionPolicyConfiguration);
      changeManager.apply(!!shouldCommit)!.forEach((packageJson) => {
        this.updatedProjects.set(packageJson.name, packageJson);
      });
      await changeManager.updateChangelogAsync(terminal, !!shouldCommit);
    }

    // Refresh rush configuration again, since we've further modified the package.json files
    // by calling changeManager.apply(...)
    this.#rushConfiguration = RushConfiguration.loadFromConfigurationFile(
      this.#rushConfiguration.rushJsonFile
    );
  }

  #ensure(versionPolicyName?: string, shouldCommit?: boolean, force?: boolean): void {
    this.#updateVersionsByPolicy(versionPolicyName, force);

    let changed: boolean = false;
    do {
      changed = false;
      // Update all dependencies if needed.
      const dependenciesUpdated: boolean = this.#updateDependencies();
      changed = changed || dependenciesUpdated;
    } while (changed);

    if (shouldCommit) {
      this.#updatePackageJsonFiles();
      this.changeFiles.forEach((changeFile) => {
        changeFile.writeSync();
      });
    }
  }

  #getManuallyVersionedProjects(): Set<string> | undefined {
    const lockStepVersionPolicyNames: Set<string> = new Set<string>();

    this.#versionPolicyConfiguration.versionPolicies.forEach((versionPolicy) => {
      if (versionPolicy instanceof LockStepVersionPolicy && versionPolicy.nextBump !== undefined) {
        lockStepVersionPolicyNames.add(versionPolicy.policyName);
      }
    });
    const lockStepProjectNames: Set<string> = new Set<string>();
    this.#rushConfiguration.projects.forEach((rushProject) => {
      if (lockStepVersionPolicyNames.has(rushProject.versionPolicyName!)) {
        lockStepProjectNames.add(rushProject.packageName);
      }
    });
    return lockStepProjectNames;
  }

  #updateVersionsByPolicy(versionPolicyName?: string, force?: boolean): boolean {
    let changed: boolean = false;

    // Update versions based on version policy
    this.#rushConfiguration.projects.forEach((rushProject) => {
      const projectVersionPolicyName: string | undefined = rushProject.versionPolicyName;
      if (
        projectVersionPolicyName &&
        (!versionPolicyName || projectVersionPolicyName === versionPolicyName)
      ) {
        const versionPolicy: VersionPolicy =
          this.#versionPolicyConfiguration.getVersionPolicy(projectVersionPolicyName);

        const oldVersion: string =
          this.updatedProjects.get(rushProject.packageName)?.version || rushProject.packageJson.version;
        const updatedProject: IPackageJson | undefined = versionPolicy.ensure(rushProject.packageJson, force);
        changed = changed || updatedProject?.version !== oldVersion;

        if (updatedProject) {
          this.updatedProjects.set(updatedProject.name, updatedProject);
          // No need to create an entry for prerelease version bump.
          if (!this.#isPrerelease(updatedProject.version) && rushProject.isMainProject) {
            this.#addChangeInfo(updatedProject.name, [this.#createChangeInfo(updatedProject, rushProject)]);
          }
        }
      }
    });

    return changed;
  }

  #isPrerelease(version: string): boolean {
    return !!semver.prerelease(version);
  }

  #addChangeInfo(packageName: string, changeInfos: IChangeInfo[]): void {
    if (!changeInfos.length) {
      return;
    }
    let changeFile: ChangeFile | undefined = this.changeFiles.get(packageName);
    if (!changeFile) {
      changeFile = new ChangeFile(
        {
          changes: [],
          packageName: packageName,
          email: this.#userEmail
        },
        this.#rushConfiguration
      );
      this.changeFiles.set(packageName, changeFile);
    }
    changeInfos.forEach((changeInfo) => {
      changeFile!.addChange(changeInfo);
    });
  }

  #updateDependencies(): boolean {
    let updated: boolean = false;

    this.#rushConfiguration.projects.forEach((rushProject) => {
      let clonedProject: IPackageJson | undefined = this.updatedProjects.get(rushProject.packageName);
      let projectVersionChanged: boolean = true;

      if (!clonedProject) {
        clonedProject = cloneDeep(rushProject.packageJson);
        projectVersionChanged = false;
      }

      const dependenciesUpdated: boolean = this.#updateProjectAllDependencies(
        rushProject,
        clonedProject!,
        projectVersionChanged
      );

      updated = updated || dependenciesUpdated;
    });

    return updated;
  }

  #updateProjectAllDependencies(
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
      this.#updateProjectDependencies(
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
      this.#updateProjectDependencies(
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
      this.#updateProjectDependencies(
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
      this.#addChangeInfo(clonedProject.name, changes);
    }

    return updated;
  }

  #updateProjectDependencies(
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
          if (this.#shouldTrackDependencyChange(rushProject, updatedDependentProjectName)) {
            this.#trackDependencyChange(
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

  #shouldTrackDependencyChange(
    rushProject: RushConfigurationProject,
    dependencyName: string
  ): boolean {
    const dependencyRushProject: RushConfigurationProject | undefined =
      this.#rushConfiguration.projectsByName.get(dependencyName);

    return (
      !!dependencyRushProject &&
      rushProject.shouldPublish &&
      (!rushProject.versionPolicy ||
        !rushProject.versionPolicy.isLockstepped ||
        (rushProject.isMainProject &&
          dependencyRushProject.versionPolicyName !== rushProject.versionPolicyName))
    );
  }

  #trackDependencyChange(
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
      this.#addChange(changes, {
        changeType: ChangeType.patch,
        packageName: clonedProject.name
      });
    }

    // If current version is not a prerelease version and new dependency is also not a prerelease version,
    // add change entry. Otherwise, too many changes will be created for frequent releases.
    if (!this.#isPrerelease(updatedDependentProject.version) && !this.#isPrerelease(clonedProject.version)) {
      this.#addChange(changes, {
        changeType: ChangeType.dependency,
        comment:
          `Dependency ${updatedDependentProject.name} version bump from ${oldDependencyVersion}` +
          ` to ${newDependencyVersion}.`,
        packageName: clonedProject.name
      });
    }
  }

  #addChange(changes: IChangeInfo[], newChange: IChangeInfo): void {
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

  #updatePackageJsonFiles(): void {
    this.updatedProjects.forEach((newPackageJson, packageName) => {
      const rushProject: RushConfigurationProject | undefined =
        this.#rushConfiguration.getProjectByName(packageName);
      // Update package.json
      if (rushProject) {
        const packagePath: string = path.join(rushProject.projectFolder, FileConstants.PackageJson);
        JsonFile.save(newPackageJson, packagePath, { updateExistingFile: true });
      }
    });
  }

  #createChangeInfo(
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
