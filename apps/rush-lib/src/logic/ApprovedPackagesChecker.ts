// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { IPackageJson, PackageName } from '@microsoft/node-core-library';

import { ApprovedPackagesPolicy } from '../api/ApprovedPackagesPolicy';
import { RushConfiguration } from '../api/RushConfiguration';
import { RushConfigurationProject } from '../api/RushConfigurationProject';
import { DependencySpecifier } from './DependencySpecifier';

export class ApprovedPackagesChecker {
  /**
   * Examines the current dependencies for the projects specified in RushConfiguration,
   * and then adds them to the 'browser-approved-packages.json' and
   * 'nonbrowser-approved-packages.json' config files.  If these files don't exist,
   * they will be created.
   *
   * If the "approvedPackagesPolicy" feature is not enabled, then no action is taken.
   */
  public static rewriteConfigFiles(rushConfiguration: RushConfiguration): void {
    const approvedPackagesPolicy: ApprovedPackagesPolicy = rushConfiguration.approvedPackagesPolicy;
    if (!approvedPackagesPolicy.enabled) {
      return;
    }

    for (const rushProject of rushConfiguration.projects) {
      const packageJson: IPackageJson = rushProject.packageJson;

      ApprovedPackagesChecker._collectDependencies(packageJson.dependencies,
        approvedPackagesPolicy, rushProject);
      ApprovedPackagesChecker._collectDependencies(packageJson.optionalDependencies,
        approvedPackagesPolicy, rushProject);
      ApprovedPackagesChecker._collectDependencies(packageJson.devDependencies,
        approvedPackagesPolicy, rushProject);
    }

    approvedPackagesPolicy.browserApprovedPackages.saveToFile();
    approvedPackagesPolicy.nonbrowserApprovedPackages.saveToFile();
  }

  private static _collectDependencies(dependencies: { [key: string]: string } | undefined,
    approvedPackagesPolicy: ApprovedPackagesPolicy, rushProject: RushConfigurationProject): void {

    if (dependencies) {
      for (const packageName of Object.keys(dependencies)) {

        let referencedPackageName: string = packageName;

        // Special handling for NPM package aliases such as this:
        //
        // "dependencies": {
        //   "alias-name": "npm:target-name@^1.2.3"
        // }
        const dependencySpecifier: DependencySpecifier
          = new DependencySpecifier(packageName, dependencies[packageName]);
        if (dependencySpecifier.aliasTarget) {
          // Use "target-name" instead of "alias-name"
          referencedPackageName = dependencySpecifier.aliasTarget.packageName;
        }

        const scope: string = PackageName.getScope(referencedPackageName);

        // Make sure the scope isn't something like "@types" which should be ignored
        if (!approvedPackagesPolicy.ignoredNpmScopes.has(scope)) {
          // Yes, add it to the list if it's not already there

          // By default we put everything in the browser file.  But if it already appears in the
          // non-browser file, then use that instead.
          if (approvedPackagesPolicy.nonbrowserApprovedPackages.getItemByName(referencedPackageName)) {
            approvedPackagesPolicy.nonbrowserApprovedPackages
              .addOrUpdatePackage(referencedPackageName, rushProject.reviewCategory);
          } else {
            approvedPackagesPolicy.browserApprovedPackages
              .addOrUpdatePackage(referencedPackageName, rushProject.reviewCategory);
          }
        }
      }
    }
  }
}
