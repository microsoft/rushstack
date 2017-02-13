// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  RushConfiguration,
  RushConfigurationProject,
  PackageReviewConfiguration,
  Utilities
} from '@microsoft/rush-lib';

export default class PackageReviewChecker {
  private _rushConfiguration: RushConfiguration;
  private _packageReviewConfiguration: PackageReviewConfiguration;

  constructor(rushConfiguraton: RushConfiguration) {
    this._rushConfiguration = rushConfiguraton;
    this._packageReviewConfiguration = PackageReviewConfiguration.loadFromFile(rushConfiguraton.packageReviewFile);
  }

  public saveCurrentDependencies(): void {
    for (const rushProject of this._rushConfiguration.projects) {
      const packageJson: PackageJson = rushProject.packageJson;

      this._collectDependencies(packageJson.dependencies, rushProject);
      this._collectDependencies(packageJson.optionalDependencies, rushProject);
      this._collectDependencies(packageJson.devDependencies, rushProject);
    }
    this.saveFile();
  }

  public saveFile(): void {
    this._packageReviewConfiguration.saveFile(this._rushConfiguration.packageReviewFile);
  }

  private _collectDependencies(dependencies: { [key: string]: string },
    rushProject: RushConfigurationProject): void {

    if (dependencies) {
      for (const packageName of Object.keys(dependencies)) {
        const scope: string = Utilities.parseScopedPackageName(packageName).scope;

        // Make sure the scope isn't something like "@types" which should be ignored
        if (!this._packageReviewConfiguration.ignoredNpmScopes.has(scope)) {
          // Yes, add it to the list if it's not already there
          this._packageReviewConfiguration.addOrUpdatePackage(packageName, false, rushProject.reviewCategory);
        }
      }
    }
  }
}
