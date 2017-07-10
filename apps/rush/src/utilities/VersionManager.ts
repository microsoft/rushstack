// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { cloneDeep } from 'lodash';

import {
  RushConfiguration,
  VersionPolicyConfiguration,
  IPackageJson,
  VersionPolicy
} from '@microsoft/rush-lib';

import PublishUtilities from './PublishUtilities';

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
   */
  public ensure(versionPolicyName?: string): Map<string, IPackageJson> {
    const updatedProjects: Map<string, IPackageJson> = new Map<string, IPackageJson>();
    const versionPolicies: Map<string, VersionPolicy> = this._versionPolicyConfiguration.versionPolicies;

    // Update versions based on version policy
    this._rushConfiguration.projects.forEach(rushProject => {
      const projectVersionPolicyName: string = rushProject.versionPolicyName;
      if (!versionPolicyName || projectVersionPolicyName === versionPolicyName) {
        const versionPolicy: VersionPolicy = this._versionPolicyConfiguration.getVersionPolicy(
          projectVersionPolicyName);
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
        const newDependencyVersion: string = PublishUtilities.getNewDependencyVersion(
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
}