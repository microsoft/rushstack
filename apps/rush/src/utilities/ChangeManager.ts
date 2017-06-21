// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  IChangeInfo,
  RushConfiguration,
  RushConfigurationProject
} from '@microsoft/rush-lib';

import PublishUtilities, {
  IChangeInfoHash
} from './PublishUtilities';
import ChangeFiles from './ChangeFiles';
import PrereleaseToken from './PrereleaseToken';
import ChangelogGenerator from './ChangelogGenerator';

/**
 * The class manages change files and controls how changes logged by change files
 * can be applied to package.json and change logs.
 */
export default class ChangeManager {
  private _prereleaseToken: PrereleaseToken;
  private _orderedChanges: IChangeInfo[];
  private _allPackages: Map<string, RushConfigurationProject>;
  private _allChanges: IChangeInfoHash;
  private _changeFiles: ChangeFiles;

  constructor(private _rushConfiguration: RushConfiguration) {
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
      this._changeFiles,
      includeCommitDetails,
      this._prereleaseToken);
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

  /**
   * Apply changes to package.json and change logs
   * @param shouldCommit - If the value is true, package.json and change logs will be updated.
   * If the value is false, package.json and change logs will not be updated. It will only do a dry-run.
   */
  public apply(shouldCommit: boolean): void {
    if (!this.hasChanges()) {
      return;
    }

    // Apply all changes to package.json files.
    PublishUtilities.updatePackages(this._allChanges, this._allPackages, shouldCommit,
      this._prereleaseToken);

    // Do not update changelog or delete the change files for prerelease.
    // Save them for the official release.
    if (!this._prereleaseToken.hasValue) {
      // Update changelogs.
      ChangelogGenerator.updateChangelogs(this._allChanges, this._allPackages, shouldCommit);

      // Remove the change request files only if "-a" was provided.
      this._changeFiles.deleteAll(shouldCommit);
    }
  }
}