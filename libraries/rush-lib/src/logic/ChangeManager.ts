// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IPackageJson } from '@rushstack/node-core-library';
import type { ITerminal } from '@rushstack/terminal';

import type { IChangeInfo } from '../api/ChangeManagement';
import type { IChangelog } from '../api/Changelog';
import type { RushConfiguration } from '../api/RushConfiguration';
import type { RushConfigurationProject } from '../api/RushConfigurationProject';
import type { VersionPolicyConfiguration } from '../api/VersionPolicyConfiguration';
import { PublishUtilities, type IChangeRequests } from './PublishUtilities';
import { ChangeFiles } from './ChangeFiles';
import { PrereleaseToken } from './PrereleaseToken';
import { ChangelogGenerator } from './ChangelogGenerator';

/**
 * The class manages change files and controls how changes logged by change files
 * can be applied to package.json and change logs.
 */
export class ChangeManager {
  #prereleaseToken!: PrereleaseToken;
  #orderedChanges!: IChangeInfo[];
  #allPackages!: ReadonlyMap<string, RushConfigurationProject>;
  #allChanges!: IChangeRequests;
  #changeFiles!: ChangeFiles;
  #rushConfiguration: RushConfiguration;
  #projectsToExclude: Set<string> | undefined;

  public constructor(rushConfiguration: RushConfiguration, projectsToExclude?: Set<string> | undefined) {
    this.#rushConfiguration = rushConfiguration;
    this.#projectsToExclude = projectsToExclude;
  }

  /**
   * Load changes from change files
   * @param prereleaseToken - prerelease token
   * @param includeCommitDetails - whether commit details need to be included in changes
   */
  public async loadAsync(
    prereleaseToken: PrereleaseToken = new PrereleaseToken(),
    includeCommitDetails: boolean = false
  ): Promise<void> {
    this.#allPackages = this.#rushConfiguration.projectsByName;

    this.#prereleaseToken = prereleaseToken;

    this.#changeFiles = new ChangeFiles(this.#rushConfiguration);
    this.#allChanges = await PublishUtilities.findChangeRequestsAsync(
      this.#allPackages,
      this.#rushConfiguration,
      this.#changeFiles,
      includeCommitDetails,
      this.#prereleaseToken,
      this.#projectsToExclude
    );
    this.#orderedChanges = PublishUtilities.sortChangeRequests(this.#allChanges.packageChanges);
  }

  public hasChanges(): boolean {
    return (
      (this.#orderedChanges && this.#orderedChanges.length > 0) ||
      (this.#allChanges && this.#allChanges.versionPolicyChanges.size > 0)
    );
  }

  public get packageChanges(): IChangeInfo[] {
    return this.#orderedChanges;
  }

  public get allPackages(): ReadonlyMap<string, RushConfigurationProject> {
    return this.#allPackages;
  }

  public validateChanges(versionConfig: VersionPolicyConfiguration): void {
    this.#allChanges.packageChanges.forEach((change, projectName) => {
      const projectInfo: RushConfigurationProject | undefined =
        this.#rushConfiguration.getProjectByName(projectName);
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
    this.#allChanges.versionPolicyChanges.forEach((versionPolicyChange, versionPolicyName) => {
      this.#rushConfiguration.versionPolicyConfiguration.update(
        versionPolicyName,
        versionPolicyChange.newVersion,
        shouldCommit
      );
    });

    // Apply all changes to package.json files.
    const updatedPackages: Map<string, IPackageJson> = PublishUtilities.updatePackages(
      this.#allChanges,
      this.#allPackages,
      this.#rushConfiguration,
      shouldCommit,
      this.#prereleaseToken,
      this.#projectsToExclude
    );

    return updatedPackages;
  }

  public async updateChangelogAsync(terminal: ITerminal, shouldCommit: boolean): Promise<void> {
    // Do not update changelog or delete the change files for prerelease.
    // Save them for the official release.
    if (!this.#prereleaseToken.hasValue) {
      // Update changelogs.
      const updatedChangelogs: IChangelog[] = ChangelogGenerator.updateChangelogs(
        this.#allChanges,
        this.#allPackages,
        this.#rushConfiguration,
        shouldCommit
      );

      // Remove the change request files only if "-a" was provided.
      await this.#changeFiles.deleteAllAsync(terminal, shouldCommit, updatedChangelogs);
    }
  }
}
