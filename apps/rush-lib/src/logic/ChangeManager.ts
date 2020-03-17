// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { IPackageJson } from '@rushstack/node-core-library';

import { IChangeInfo } from '../api/ChangeManagement';
import { IChangelog } from '../api/Changelog';
import { RushConfiguration } from '../api/RushConfiguration';
import { RushConfigurationProject } from '../api/RushConfigurationProject';
import { VersionPolicyConfiguration } from '../api/VersionPolicyConfiguration';
import { PublishUtilities, IChangeInfoHash } from './PublishUtilities';
import { ChangeFiles } from './ChangeFiles';
import { PrereleaseToken } from './PrereleaseToken';
import { ChangelogGenerator } from './ChangelogGenerator';

/**
 * The class manages change files and controls how changes logged by change files
 * can be applied to package.json and change logs.
 */
export class ChangeManager {
  private _prereleaseToken: PrereleaseToken;
  private _orderedChanges: IChangeInfo[];
  private _allPackages: Map<string, RushConfigurationProject>;
  private _allChanges: IChangeInfoHash;
  private _changeFiles: ChangeFiles;
  private _rushConfiguration: RushConfiguration;
  private _lockStepProjectsToExclude: Set<string> | undefined;

  public constructor(
    rushConfiguration: RushConfiguration,
    lockStepProjectsToExclude?: Set<string> | undefined
  ) {
    this._rushConfiguration = rushConfiguration;
    this._lockStepProjectsToExclude = lockStepProjectsToExclude;
  }

  /**
   * Load changes from change files
   * @param changesPath - location of change files
   * @param prereleaseToken - prerelease token
   * @param includeCommitDetails - whether commit details need to be included in changes
   */
  public load(
    changesPath: string,
    prereleaseToken: PrereleaseToken = new PrereleaseToken(),
    includeCommitDetails: boolean = false
  ): void {
    this._allPackages = this._rushConfiguration.projectsByName;

    this._prereleaseToken = prereleaseToken;

    this._changeFiles = new ChangeFiles(changesPath);
    this._allChanges = PublishUtilities.findChangeRequests(
      this._allPackages,
      this._rushConfiguration,
      this._changeFiles,
      includeCommitDetails,
      this._prereleaseToken,
      this._lockStepProjectsToExclude
      );
    this._orderedChanges = PublishUtilities.sortChangeRequests(this._allChanges);
  }

  public hasChanges(): boolean {
    return this._orderedChanges && this._orderedChanges.length > 0;
  }

  public get changes(): IChangeInfo[] {
    return this._orderedChanges;
  }

  public get allPackages(): Map<string, RushConfigurationProject> {
    return this._allPackages;
  }

  public validateChanges(versionConfig: VersionPolicyConfiguration): void {
    Object
      .keys(this._allChanges)
      .filter((key) => {
        const projectInfo: RushConfigurationProject | undefined = this._rushConfiguration.getProjectByName(key);
        if (projectInfo) {
          if (projectInfo.versionPolicy) {
            const changeInfo: IChangeInfo = this._allChanges[key];
            projectInfo.versionPolicy.validate(changeInfo.newVersion!, key);
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

    // Apply all changes to package.json files.
    const updatedPackages: Map<string, IPackageJson> = PublishUtilities.updatePackages(
      this._allChanges,
      this._allPackages,
      this._rushConfiguration,
      shouldCommit,
      this._prereleaseToken,
      this._lockStepProjectsToExclude);

    return updatedPackages;
  }

  public updateChangelog(shouldCommit: boolean): void {
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
      this._changeFiles.deleteAll(shouldCommit, updatedChangelogs);
    }
  }
}