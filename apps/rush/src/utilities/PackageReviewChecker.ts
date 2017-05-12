// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  IPackageJson,
  RushConfiguration,
  RushConfigurationProject,
  Utilities
} from '@microsoft/rush-lib';

export class PackageReviewChecker {
  /**
   * Examines the current dependencies for the projects specified in RushConfiguration,
   * and then adds them to the 'browser-approved-packages.json' and
   * 'nonbrowser-approved-packages.json' config files.  If these files don't exist,
   * they will be created.
   *
   * If the "approvedPackagesPolicy" feature is not enabled, then no action is taken.
   */
  public static rewriteConfigFiles(rushConfiguration: RushConfiguration): void {
    if (!rushConfiguration.approvedPackagesPolicyEnabled) {
      return;
    }

    for (const rushProject of rushConfiguration.projects) {
      const packageJson: IPackageJson = rushProject.packageJson;

      PackageReviewChecker._collectDependencies(packageJson.dependencies, rushConfiguration, rushProject);
      PackageReviewChecker._collectDependencies(packageJson.optionalDependencies, rushConfiguration, rushProject);
      PackageReviewChecker._collectDependencies(packageJson.devDependencies, rushConfiguration, rushProject);
    }

    rushConfiguration.browserApprovedPackages.saveToFile();
    rushConfiguration.nonbrowserApprovedPackages.saveToFile();
  }

  private static _collectDependencies(dependencies: { [key: string]: string },
    rushConfiguration: RushConfiguration, rushProject: RushConfigurationProject): void {

    if (dependencies) {
      for (const packageName of Object.keys(dependencies)) {
        const scope: string = Utilities.parseScopedPackageName(packageName).scope;

        // Make sure the scope isn't something like "@types" which should be ignored
        if (!rushConfiguration.approvedPackagesIgnoredNpmScopes.has(scope)) {
          // Yes, add it to the list if it's not already there

          // By default we put everything in the browser file.  But if it already appears in the
          // non-browser file, then use that instead.
          if (rushConfiguration.nonbrowserApprovedPackages.getItemByName(packageName)) {
            rushConfiguration.nonbrowserApprovedPackages
              .addOrUpdatePackage(packageName, rushProject.reviewCategory);
          } else {
            rushConfiguration.browserApprovedPackages
              .addOrUpdatePackage(packageName, rushProject.reviewCategory);
          }
        }
      }
    }
  }
}
