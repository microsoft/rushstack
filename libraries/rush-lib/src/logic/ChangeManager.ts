// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IPackageJson } from '@rushstack/node-core-library';

import type { IChangeInfo } from '../api/ChangeManagement.ts';
import type { IChangelog } from '../api/Changelog.ts';
import type { RushConfiguration } from '../api/RushConfiguration.ts';
import type { RushConfigurationProject } from '../api/RushConfigurationProject.ts';
import type { VersionPolicyConfiguration } from '../api/VersionPolicyConfiguration.ts';
import { PublishUtilities, type IChangeRequests } from './PublishUtilities.ts';
import { ChangeFiles } from './ChangeFiles.ts';
import { PrereleaseToken } from './PrereleaseToken.ts';
import { ChangelogGenerator } from './ChangelogGenerator.ts';

/**
 * The class manages change files and controls how changes logged by change files
 * can be applied to package.json and change logs.
 */
export class ChangeManager {
  private _prereleaseToken!: PrereleaseToken;
  private _orderedChanges!: IChangeInfo[];
  private _allPackages!: ReadonlyMap<string, RushConfigurationProject>;
  private _allChanges!: IChangeRequests;
  private _changeFiles!: ChangeFiles;
  private _rushConfiguration: RushConfiguration;
  private _projectsToExclude: Set<string> | undefined;

  public constructor(rushConfiguration: RushConfiguration, projectsToExclude?: Set<string> | undefined) {
    this._rushConfiguration = rushConfiguration;
    this._projectsToExclude = projectsToExclude;
  }

  /**
   * Load changes from change files
   * @param changesPath - location of change files
   * @param prereleaseToken - prerelease token
   * @param includeCommitDetails - whether commit details need to be included in changes
   */
  public async loadAsync(
    changesPath: string,
    prereleaseToken: PrereleaseToken = new PrereleaseToken(),
    includeCommitDetails: boolean = false
  ): Promise<void> {
    this._allPackages = this._rushConfiguration.projectsByName;

    this._prereleaseToken = prereleaseToken;

    this._changeFiles = new ChangeFiles(changesPath);
    this._allChanges = await PublishUtilities.findChangeRequestsAsync(
      this._allPackages,
      this._rushConfiguration,
      this._changeFiles,
      includeCommitDetails,
      this._prereleaseToken,
      this._projectsToExclude
    );
    this._orderedChanges = PublishUtilities.sortChangeRequests(this._allChanges.packageChanges);
  }

  public hasChanges(): boolean {
    return (
      (this._orderedChanges && this._orderedChanges.length > 0) ||
      (this._allChanges && this._allChanges.versionPolicyChanges.size > 0)
    );
  }

  public get packageChanges(): IChangeInfo[] {
    return this._orderedChanges;
  }

  public get allPackages(): ReadonlyMap<string, RushConfigurationProject> {
    return this._allPackages;
  }

  public validateChanges(versionConfig: VersionPolicyConfiguration): void {
    this._allChanges.packageChanges.forEach((change, projectName) => {
      const projectInfo: RushConfigurationProject | undefined =
        this._rushConfiguration.getProjectByName(projectName);
      if (projectInfo) {
        if (projectInfo.versionPolicy) {
          projectInfo.versionPolicy.validate(change.newVersion!, projectName);
        }
      }
    });
  }

  /**
   * Apply changes to package.json
   * @param shouldCommit - If the value is true, package.json will be updated.
   * If the value is false, package.json and change logs will not be updated. It will only do a dry-run.
   */
  public apply(shouldCommit: boolean): Map<string, IPackageJson> | undefined {
    if (!this.hasChanges()) {
      return;
    }

    // Update all the changed version policies
    this._allChanges.versionPolicyChanges.forEach((versionPolicyChange, versionPolicyName) => {
      this._rushConfiguration.versionPolicyConfiguration.update(
        versionPolicyName,
        versionPolicyChange.newVersion,
        shouldCommit
      );
    });

    // Apply all changes to package.json files.
    const updatedPackages: Map<string, IPackageJson> = PublishUtilities.updatePackages(
      this._allChanges,
      this._allPackages,
      this._rushConfiguration,
      shouldCommit,
      this._prereleaseToken,
      this._projectsToExclude
    );

    return updatedPackages;
  }

  public async updateChangelogAsync(shouldCommit: boolean): Promise<void> {
    // Do not update changelog or delete the change files for prerelease.
    // Save them for the official release.
    if (!this._prereleaseToken.hasValue) {
      // Update changelogs.
      const updatedChangelogs: IChangelog[] = ChangelogGenerator.updateChangelogs(
        this._allChanges,
        this._allPackages,
        this._rushConfiguration,
        shouldCommit
      );

      // Remove the change request files only if "-a" was provided.
      await this._changeFiles.deleteAllAsync(shouldCommit, updatedChangelogs);
    }
  }
}
