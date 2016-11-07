/**
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 */

import {
  RushConfig,
  RushConfigProject,
  PackageReviewConfig,
  Utilities
} from '@microsoft/rush-lib';

export default class PackageReviewChecker {
  private _rushConfig: RushConfig;
  private _packageReviewConfig: PackageReviewConfig;

  constructor(rushConfig: RushConfig) {
    this._rushConfig = rushConfig;
    this._packageReviewConfig = PackageReviewConfig.loadFromFile(rushConfig.packageReviewFile);
  }

  public saveCurrentDependencies(): void {
    for (const rushProject of this._rushConfig.projects) {
      const packageJson: PackageJson = rushProject.packageJson;

      this._collectDependencies(packageJson.dependencies, rushProject);
      this._collectDependencies(packageJson.optionalDependencies, rushProject);
      this._collectDependencies(packageJson.devDependencies, rushProject);
    }
    this.saveFile();
  }

  public saveFile(): void {
    this._packageReviewConfig.saveFile(this._rushConfig.packageReviewFile);
  }

  private _collectDependencies(dependencies: { [key: string]: string },
    rushProject: RushConfigProject): void {

    if (dependencies) {
      for (const packageName of Object.keys(dependencies)) {
        const scope: string = Utilities.parseScopedPackageName(packageName).scope;

        // Make sure the scope isn't something like "@types" which should be ignored
        if (!this._packageReviewConfig.ignoredNpmScopes.has(scope)) {
          // Yes, add it to the list if it's not already there
          this._packageReviewConfig.addOrUpdatePackage(packageName, false, rushProject.reviewCategory);
        }
      }
    }
  }
}
