// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { cloneDeep } from 'lodash';
import * as semver from 'semver';

import {
  RushConfiguration,
  IPackageJson,
  VersionPolicy
} from '@microsoft/rush-lib';

import PublishUtilities from './PublishUtilities';

export class VersionManager {
  constructor(private _rushConfiguration: RushConfiguration) {
  }

  /**
   * Ensures project versions follow the provided version policy. If version policy is not
   * provided, all projects will have their version checked according to the associated version policy.
   * package.json files will be updated if needed.
   * This method does not commit changes.
   * @param versionPolicyName -- version policy name
   */
  public ensure(versionPolicyName?: string): Map<string, IPackageJson> {
    const updatedProjects: Map<string, IPackageJson> = new Map<string, IPackageJson>();
    const versionPolicies: Map<string, VersionPolicy> = this._rushConfiguration.versionPolicies;

    // Update versions based on version policy
    this._rushConfiguration.projects.forEach(rushProject => {
      const versionPolicy: VersionPolicy = rushProject.versionPolicy;
      if (versionPolicy &&
        (!versionPolicyName || versionPolicy.policyName === versionPolicyName)) {
        const updatedProject: IPackageJson = versionPolicy.ensure(rushProject.packageJson);
        if (updatedProject) {
          updatedProjects.set(updatedProject.name, updatedProject);
        }
      }
    });

    // Update all dependencies if needed.
    this._rushConfiguration.projects.forEach(rushProject => {
      let clonedProject: IPackageJson = updatedProjects.get(rushProject.packageName);
      if (!clonedProject) {
        clonedProject = cloneDeep(rushProject.packageJson);
      }
      this._updateDependencies(clonedProject, updatedProjects);
    });

    return updatedProjects;
  }

  private _updateDependencies(clonedProject: IPackageJson,
    updatedProjects: Map<string, IPackageJson>
  ): void {
    if (!clonedProject.dependencies) {
      return;
    }
    const dependencies: { [key: string]: string; } = clonedProject.dependencies;
    let needToUpdate: boolean = false;

    updatedProjects.forEach((updatedProject, updatedProjectName) => {
      if (dependencies[updatedProjectName]) {
        const newDependencyVersion: string = this._getNewDependencyVersion(
          dependencies,
          updatedProjectName,
          updatedProject.version
        );
        if (newDependencyVersion !== dependencies[updatedProjectName]) {
          dependencies[updatedProjectName] = newDependencyVersion;
          needToUpdate = true;
        }
      }
    });
    if (needToUpdate) {
      updatedProjects.set(clonedProject.name, clonedProject);
    }
  }

  private _getNewDependencyVersion(dependencies: { [key: string]: string; },
    dependencyName: string,
    newProjectVersion: string
  ): string {
    const currentDependencyVersion: string = dependencies[dependencyName];
    let newDependencyVersion: string;

    if (PublishUtilities.isRangeDependency(currentDependencyVersion)) {
      newDependencyVersion = this._getNewRangeDependency(newProjectVersion);
    } else if (currentDependencyVersion.lastIndexOf('~', 0) === 0) {
      newDependencyVersion = '~' + newProjectVersion;
    } else if (currentDependencyVersion.lastIndexOf('^', 0) === 0) {
      newDependencyVersion = '^' + newProjectVersion;
    } else {
      newDependencyVersion = newProjectVersion;
    }
    return newDependencyVersion;
  }

  private _getNewRangeDependency(newVersion: string): string {
    return `>=${newVersion} <${semver.inc(newVersion, 'major')}`;
  }
}