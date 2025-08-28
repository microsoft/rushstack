// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ApprovedPackagesPolicy } from '../api/ApprovedPackagesPolicy';
import type { RushConfiguration } from '../api/RushConfiguration';
import type { RushConfigurationProject } from '../api/RushConfigurationProject';
import { DependencySpecifier } from './DependencySpecifier';
import type { IPackageJson } from '@rushstack/node-core-library';

export class ApprovedPackagesChecker {
  private readonly _rushConfiguration: RushConfiguration;
  private _approvedPackagesPolicy: ApprovedPackagesPolicy;
  private _filesAreOutOfDate: boolean;

  public constructor(rushConfiguration: RushConfiguration) {
    this._rushConfiguration = rushConfiguration;
    this._approvedPackagesPolicy = this._rushConfiguration.approvedPackagesPolicy;
    this._filesAreOutOfDate = false;

    if (this._approvedPackagesPolicy.enabled) {
      this._updateApprovedPackagesPolicy();
    }
  }

  /**
   * If true, the files on disk are out of date.
   */
  public get approvedPackagesFilesAreOutOfDate(): boolean {
    return this._filesAreOutOfDate;
  }

  /**
   * Examines the current dependencies for the projects specified in RushConfiguration,
   * and then adds them to the 'browser-approved-packages.json' and
   * 'nonbrowser-approved-packages.json' config files.  If these files don't exist,
   * they will be created.
   *
   * If the "approvedPackagesPolicy" feature is not enabled, then no action is taken.
   */
  public rewriteConfigFiles(): void {
    const approvedPackagesPolicy: ApprovedPackagesPolicy = this._rushConfiguration.approvedPackagesPolicy;
    if (approvedPackagesPolicy.enabled) {
      approvedPackagesPolicy.browserApprovedPackages.saveToFile();
      approvedPackagesPolicy.nonbrowserApprovedPackages.saveToFile();
    }
  }

  private _updateApprovedPackagesPolicy(): void {
    for (const rushProject of this._rushConfiguration.projects) {
      const packageJson: IPackageJson = rushProject.packageJson;

      this._collectDependencies(packageJson.dependencies, this._approvedPackagesPolicy, rushProject);
      this._collectDependencies(packageJson.devDependencies, this._approvedPackagesPolicy, rushProject);
      this._collectDependencies(packageJson.peerDependencies, this._approvedPackagesPolicy, rushProject);
      this._collectDependencies(packageJson.optionalDependencies, this._approvedPackagesPolicy, rushProject);
    }
  }

  private _collectDependencies(
    dependencies: { [key: string]: string } | undefined,
    approvedPackagesPolicy: ApprovedPackagesPolicy,
    rushProject: RushConfigurationProject
  ): void {
    if (dependencies) {
      for (const packageName of Object.keys(dependencies)) {
        let referencedPackageName: string = packageName;

        // Special handling for NPM package aliases such as this:
        //
        // "dependencies": {
        //   "alias-name": "npm:target-name@^1.2.3"
        // }
        const dependencySpecifier: DependencySpecifier = DependencySpecifier.parseWithCache(
          packageName,
          dependencies[packageName]
        );
        if (dependencySpecifier.aliasTarget) {
          // Use "target-name" instead of "alias-name"
          referencedPackageName = dependencySpecifier.aliasTarget.packageName;
        }

        const scope: string = this._rushConfiguration.packageNameParser.getScope(referencedPackageName);

        // Make sure the scope isn't something like "@types" which should be ignored
        if (!approvedPackagesPolicy.ignoredNpmScopes.has(scope) && rushProject.reviewCategory) {
          // Yes, add it to the list if it's not already there

          let updated: boolean = false;

          // By default we put everything in the browser file.  But if it already appears in the
          // non-browser file, then use that instead.
          if (approvedPackagesPolicy.nonbrowserApprovedPackages.getItemByName(referencedPackageName)) {
            updated = approvedPackagesPolicy.nonbrowserApprovedPackages.addOrUpdatePackage(
              referencedPackageName,
              rushProject.reviewCategory
            );
          } else {
            updated = approvedPackagesPolicy.browserApprovedPackages.addOrUpdatePackage(
              referencedPackageName,
              rushProject.reviewCategory
            );
          }

          this._filesAreOutOfDate = this._filesAreOutOfDate || updated;
        }
      }
    }
  }
}
