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

export default class ChangeManager {
  private _prereleaseToken: PrereleaseToken;
  private _orderedChanges: IChangeInfo[];
  private _allPackages: Map<string, RushConfigurationProject>;
  private _allChanges: IChangeInfoHash;
  private _changeFiles: ChangeFiles;

  constructor(private _rushConfiguration: RushConfiguration) {
  }

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