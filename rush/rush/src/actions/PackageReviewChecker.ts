/**
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 */

import { RushConfig, RushConfigProject, PackageReviewConfig } from '@microsoft/rush-lib';

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

        // Is it an external package?
        if (!this._rushConfig.getProjectByName(packageName)) {
          // Yes, add it to the list if it's not already there
          this._packageReviewConfig.addOrUpdatePackage(packageName, false, rushProject.reviewCategory);
        }
      }
    }
  }
}
