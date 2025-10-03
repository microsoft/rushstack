// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { ApprovedPackagesConfiguration } from './ApprovedPackagesConfiguration';
import { RushConstants } from '../logic/RushConstants';
import type {
  RushConfiguration,
  IRushConfigurationJson,
  IApprovedPackagesPolicyJson
} from './RushConfiguration';

/**
 * This is a helper object for RushConfiguration.
 * It exposes the "approvedPackagesPolicy" feature from rush.json.
 * @public
 */
export class ApprovedPackagesPolicy {
  /**
   * Whether the feature is enabled.  The feature is enabled if the "approvedPackagesPolicy"
   * field is assigned in rush.json.
   */
  public readonly enabled: boolean;

  /**
   * A list of NPM package scopes that will be excluded from review (e.g. `@types`)
   */
  public readonly ignoredNpmScopes: ReadonlySet<string>;

  /**
   * A list of category names that are valid for usage as the RushConfigurationProject.reviewCategory field.
   * This array will never be undefined.
   */
  public readonly reviewCategories: ReadonlySet<string>;

  /**
   * Packages approved for usage in a web browser.  This is the stricter of the two types, so by default
   * all new packages are added to this file.
   *
   * @remarks
   *
   * This is part of an optional approval workflow, whose purpose is to review any new dependencies
   * that are introduced (e.g. maybe a legal review is required, or maybe we are trying to minimize bloat).
   * When Rush discovers a new dependency has been added to package.json, it will update the file.
   * The intent is that the file will be stored in Git and tracked by a branch policy that notifies
   * reviewers when a PR attempts to modify the file.
   *
   * Example filename: `C:\MyRepo\common\config\rush\browser-approved-packages.json`
   */
  public readonly browserApprovedPackages: ApprovedPackagesConfiguration;

  /**
   * Packages approved for usage everywhere *except* in a web browser.
   *
   * @remarks
   *
   * This is part of an optional approval workflow, whose purpose is to review any new dependencies
   * that are introduced (e.g. maybe a legal review is required, or maybe we are trying to minimize bloat).
   * The intent is that the file will be stored in Git and tracked by a branch policy that notifies
   * reviewers when a PR attempts to modify the file.
   *
   * Example filename: `C:\MyRepo\common\config\rush\browser-approved-packages.json`
   */
  public readonly nonbrowserApprovedPackages: ApprovedPackagesConfiguration;

  /** @internal */
  public constructor(rushConfiguration: RushConfiguration, rushConfigurationJson: IRushConfigurationJson) {
    const approvedPackagesPolicy: IApprovedPackagesPolicyJson =
      rushConfigurationJson.approvedPackagesPolicy || {};

    this.enabled = !!rushConfigurationJson.approvedPackagesPolicy;
    this.ignoredNpmScopes = new Set<string>(approvedPackagesPolicy.ignoredNpmScopes);
    this.reviewCategories = new Set<string>(approvedPackagesPolicy.reviewCategories);

    if (this.enabled) {
      if (!this.reviewCategories.size) {
        throw new Error(
          `The "approvedPackagesPolicy" feature is enabled ${RushConstants.rushJsonFilename}, but the reviewCategories` +
            ` list is not configured.`
        );
      }
    }

    // Load browser-approved-packages.json
    const browserApprovedPackagesPath: string = path.join(
      rushConfiguration.commonRushConfigFolder,
      RushConstants.browserApprovedPackagesFilename
    );
    this.browserApprovedPackages = new ApprovedPackagesConfiguration(browserApprovedPackagesPath);
    this.browserApprovedPackages.tryLoadFromFile(this.enabled);

    // Load nonbrowser-approved-packages.json
    const nonbrowserApprovedPackagesPath: string = path.join(
      rushConfiguration.commonRushConfigFolder,
      RushConstants.nonbrowserApprovedPackagesFilename
    );
    this.nonbrowserApprovedPackages = new ApprovedPackagesConfiguration(nonbrowserApprovedPackagesPath);
    this.nonbrowserApprovedPackages.tryLoadFromFile(this.enabled);
  }
}
