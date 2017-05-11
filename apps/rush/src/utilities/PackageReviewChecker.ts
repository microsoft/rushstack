// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  IPackageJson,
  RushConfiguration,
  RushConfigurationProject,
  Utilities
} from '@microsoft/rush-lib';

export default class PackageReviewChecker {
  private _rushConfiguration: RushConfiguration;

  constructor(rushConfiguraton: RushConfiguration) {
    this._rushConfiguration = rushConfiguraton;
  }

  public saveCurrentDependencies(): void {
    for (const rushProject of this._rushConfiguration.projects) {
      const packageJson: IPackageJson = rushProject.packageJson;

      this._collectDependencies(packageJson.dependencies, rushProject);
      this._collectDependencies(packageJson.optionalDependencies, rushProject);
      this._collectDependencies(packageJson.devDependencies, rushProject);
    }
    this.saveFile();
  }

  public saveFile(): void {
    this._rushConfiguration.browserApprovedPackages.saveToFile();
    this._rushConfiguration.nonbrowserApprovedPackages.saveToFile();
  }

  private _collectDependencies(dependencies: { [key: string]: string },
    rushProject: RushConfigurationProject): void {

    if (dependencies) {
      for (const packageName of Object.keys(dependencies)) {
        const scope: string = Utilities.parseScopedPackageName(packageName).scope;

        // Make sure the scope isn't something like "@types" which should be ignored
        if (!this._rushConfiguration.approvedPackagesIgnoredNpmScopes.has(scope)) {
          // Yes, add it to the list if it's not already there

          // By default we put everything in the browser file.  But if it already appears in the
          // non-browser file, then use that instead.
          if (this._rushConfiguration.nonbrowserApprovedPackages.getItemByName(packageName)) {
            this._rushConfiguration.nonbrowserApprovedPackages
              .addOrUpdatePackage(packageName, rushProject.reviewCategory);
          } else {
            this._rushConfiguration.browserApprovedPackages
              .addOrUpdatePackage(packageName, rushProject.reviewCategory);
          }
        }
      }
    }
  }
}
