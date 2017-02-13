// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * This file contains a set of helper functions that are unit tested and used with the PublishAction,
 * which itself it a thin wrapper around these helpers.
 */

import { EOL } from 'os';
import * as fsx from 'fs-extra';
import * as path from 'path';
import * as semver from 'semver';
import {
  IPackageJson,
  IChangeInfo,
  ChangeType,
  RushConfigurationProject
} from '@microsoft/rush-lib';

export interface IChangeInfoHash {
  [key: string]: IChangeInfo;
}
import { execSync } from 'child_process';

export default class PublishUtilities {
  /**
   * Finds change requests in the given folder.
   * @param changesPath Path to the changes folder.
   * @returns Dictionary of all change requests, keyed by package name.
   */
  public static findChangeRequests(
    allPackages: Map<string, RushConfigurationProject>,
    changesPath: string,
    includeCommitDetails?: boolean,
    prereleaseName?: string
  ): IChangeInfoHash {

    let changeFiles: string[] = [];
    const allChanges: IChangeInfoHash = {};
    console.log(`Finding changes in: ${changesPath}`);

    try {
      changeFiles = fsx.readdirSync(changesPath).filter(filename => path.extname(filename) === '.json');
    } catch (e) { /* no-op */ }

    // Add the minimum changes defined by the change descriptions.
    changeFiles.forEach((file: string) => {
      const fullPath: string = path.resolve(changesPath, file);
      const changeRequest: IChangeInfo = JSON.parse(fsx.readFileSync(fullPath, 'utf8'));

      if (includeCommitDetails) {
        PublishUtilities._updateCommitDetails(fullPath, changeRequest.changes);
      }

      for (const change of changeRequest.changes) {
        PublishUtilities._addChange(change, allChanges, allPackages);
      }
    });

    // For each requested package change, ensure downstream dependencies are also updated.
    for (const packageName in allChanges) {
      if (allChanges.hasOwnProperty(packageName)) {
        PublishUtilities._updateDownstreamDependencies(
          allChanges[packageName],
          allChanges,
          allPackages,
          prereleaseName
        );
      }
    }

    // Update orders so that downstreams are marked to come after upstreams.
    for (const packageName in allChanges) {
      if (allChanges.hasOwnProperty(packageName)) {
        const change: IChangeInfo = allChanges[packageName];
        const project: RushConfigurationProject = allPackages.get(packageName);
        const pkg: IPackageJson = project.packageJson;
        const deps: string[] = project.downstreamDependencyProjects;

        // Write the new version expected for the change.
        change.newVersion = (change.changeType >= ChangeType.patch) ?
          semver.inc(pkg.version, ChangeType[change.changeType]) :
          pkg.version;

        if (deps) {
          for (const depName of deps) {
            const depChange: IChangeInfo = allChanges[depName];

            if (depChange) {
              depChange.order = Math.max(change.order + 1, depChange.order);
            }
          }
        }
      }
    }

    return allChanges;
  }

  /**
   * Given the changes hash, flattens them into a sorted array based on their dependency order.
   * @params allChanges - hash of change requests.
   * @returns Sorted array of change requests.
   */
  public static sortChangeRequests(allChanges: IChangeInfoHash): IChangeInfo[] {
    return Object
      .keys(allChanges)
      .map(key => allChanges[key])
      .sort((a, b) => a.order < b.order ? -1 : 1);
  }

  /**
   * Given a single change request, updates the package json file with updated versions on disk.
   */
  public static updatePackages(
    allChanges: IChangeInfoHash,
    allPackages: Map<string, RushConfigurationProject>,
    shouldCommit: boolean,
    prereleaseName?: string
  ): void {

    Object.keys(allChanges).forEach(packageName => PublishUtilities._writePackageChanges(
      allChanges[packageName],
      allChanges,
      allPackages,
      shouldCommit,
      prereleaseName));
  }

  /**
   * Returns the generated tagname to use for a published commit, given package name and version.
   */
  public static createTagname(packageName: string, version: string): string {
    return packageName + '_v' + version;
  }

  public static isRangeDependency(version: string): boolean {
    const LOOSE_PKG_REGEX: RegExp = />=?(?:\d+\.){2}\d+\s+<(?:\d+\.){2}\d+/;

    return LOOSE_PKG_REGEX.test(version);
  }

  /**
   * Find changed packages that are not included in the provided change file.
   */
  public static findMissingChangedPackages(
    changeFileFullPath: string,
    changedPackages: string[]
    ): string[] {
    const changeRequest: IChangeInfo = JSON.parse(fsx.readFileSync(changeFileFullPath, 'utf8'));
    const requiredSet: Set<string> = new Set(changedPackages);
    changeRequest.changes.forEach(change => {
      requiredSet.delete(change.packageName);
    });
    const missingProjects: string[] = [];
    requiredSet.forEach(name => {
      missingProjects.push(name);
    });
    return missingProjects;
  }

  private static _updateCommitDetails(filename: string, changes: IChangeInfo[]): void {
    try {
      const fileLog: string = execSync('git log -n 1 ' + filename, { cwd: path.dirname(filename) }).toString();
      const author: string = fileLog.match(/Author: (.*)/)[1];
      const commit: string = fileLog.match(/commit (.*)/)[1];

      changes.forEach(change => {
        change.author = author;
        change.commit = commit;
      });
    } catch (e) { /* no-op, best effort. */ }
  }

  private static _writePackageChanges(
    change: IChangeInfo,
    allChanges: IChangeInfoHash,
    allPackages: Map<string, RushConfigurationProject>,
    shouldCommit: boolean,
    prereleaseName?: string
  ): void {
    const newVersion: string = PublishUtilities._getChangeInfoNewVersion(change, prereleaseName);

    console.log(
      `${EOL}* ${shouldCommit ? 'APPLYING' : 'DRYRUN'}: ${ChangeType[change.changeType]} update ` +
      `for ${change.packageName} to ${newVersion}`
    );

    const project: RushConfigurationProject = allPackages.get(change.packageName);
    const pkg: IPackageJson = project.packageJson;
    const packagePath: string = path.join(project.projectFolder, 'package.json');

    pkg.version = newVersion;

    // Update the package's dependencies.
    PublishUtilities._updateDependencies(pkg.name, pkg.dependencies, allChanges, allPackages, prereleaseName);
    // Update the package's dev dependencies.
    PublishUtilities._updateDependencies(pkg.name, pkg.devDependencies, allChanges, allPackages, prereleaseName);

    change.changes.forEach(subChange => {
      if (subChange.comment) {
        console.log(` - [${ChangeType[subChange.changeType]}] ${subChange.comment}`);
      }
    });

    if (shouldCommit) {
      fsx.writeFileSync(packagePath, JSON.stringify(pkg, undefined, 2), 'utf8');
    }
  }

  private static _isCyclicDependency(
    allPackages: Map<string, RushConfigurationProject>,
    packageName: string,
    dependencyName: string
  ): boolean {
    const packageConfig: RushConfigurationProject = allPackages.get(packageName);
    return !!packageConfig && packageConfig.cyclicDependencyProjects.has(dependencyName);
  }

  private static _updateDependencies(
    packageName: string,
    dependencies: { [key: string]: string; },
    allChanges: IChangeInfoHash,
    allPackages: Map<string, RushConfigurationProject>,
    prereleaseName: string
  ): void {

    if (dependencies) {
      Object.keys(dependencies).forEach(depName => {
        if (!PublishUtilities._isCyclicDependency(allPackages, packageName, depName)) {
          const depChange: IChangeInfo = allChanges[depName];

          if (depChange && prereleaseName) {
            // For prelease, the newVersion needs to be appended with prerelease name.
            // And dependency should specify the specific prerelease version.
            dependencies[depName] = PublishUtilities._getChangeInfoNewVersion(depChange, prereleaseName);
          } else if (depChange && depChange.changeType >= ChangeType.patch) {
            PublishUtilities._updateDependencyVersion(
              packageName,
              dependencies,
              depName,
              depChange,
              allChanges,
              allPackages);
          }
        }
      });
    }
  }

  /**
   * Gets the new version from the ChangeInfo.
   * The value of newVersion in ChangeInfo remains unchanged when the change type is dependency,
   * However, for pre-release build, it won't pick up the updated pre-released dependencies. That is why
   * this function should return a pre-released patch for that case.
   */
  private static _getChangeInfoNewVersion(
    change: IChangeInfo,
    prereleaseName: string
  ): string {
    let newVersion: string = change.newVersion;
    if (prereleaseName) {
      if (change.changeType === ChangeType.dependency) {
        newVersion = semver.inc(newVersion, 'patch');
      }
      return `${newVersion}-${prereleaseName}`;
    } else {
      return newVersion;
    }
  }

  /**
   * Adds the given change to the allChanges map.
   *
   * @returns true if the change caused the dependency change type to increase.
   */
  private static _addChange(
    change: IChangeInfo,
    allChanges: IChangeInfoHash,
    allPackages: Map<string, RushConfigurationProject>
  ): boolean {
    let hasChanged: boolean = false;
    const packageName: string = change.packageName;
    const project: RushConfigurationProject = allPackages.get(packageName);

    if (!project) {
      console.log(`The package ${packageName} was requested for publishing but ` +
        `does not exist. Skip this change.`);
      return;
    }

    const pkg: IPackageJson = project.packageJson;
    let currentChange: IChangeInfo;

    // If the given change does not have a changeType, derive it from the "type" string.
    if (change.changeType === undefined) {
      change.changeType = ChangeType[change.type];
    }

    if (!allChanges[packageName]) {
      hasChanged = true;
      currentChange = allChanges[packageName] = {
        packageName,
        changeType: change.changeType,
        order: 0,
        changes: [change]
      };
    } else {
      currentChange = allChanges[packageName];

      const oldChangeType: ChangeType = currentChange.changeType;

      currentChange.changeType = Math.max(currentChange.changeType, change.changeType);
      currentChange.changes.push(change);

      hasChanged = hasChanged || (oldChangeType !== currentChange.changeType);
    }

    currentChange.newVersion = change.changeType >= ChangeType.patch ?
      semver.inc(pkg.version, ChangeType[currentChange.changeType]) :
      pkg.version;

    currentChange.newRangeDependency =
      `>=${currentChange.newVersion} <${semver.inc(currentChange.newVersion, 'major')}`;

    return hasChanged;
  }

  private static _updateDownstreamDependencies(
    change: IChangeInfo,
    allChanges: IChangeInfoHash,
    allPackages: Map<string, RushConfigurationProject>,
    prereleaseName: string
  ): void {

    const packageName: string = change.packageName;
    const downstreamNames: string[] = allPackages.get(packageName).downstreamDependencyProjects;

    // Iterate through all downstream dependencies for the package.
    if (downstreamNames) {
      if ((change.changeType >= ChangeType.patch) ||
        (prereleaseName && change.changeType === ChangeType.dependency)) {
        for (const depName of downstreamNames) {
          const pkg: IPackageJson = allPackages.get(depName).packageJson;

          PublishUtilities._updateDownstreamDependency(pkg.name, pkg.dependencies, change, allChanges, allPackages,
            prereleaseName);
          PublishUtilities._updateDownstreamDependency(pkg.name, pkg.devDependencies, change, allChanges, allPackages,
            prereleaseName);
        }
      }
    }
  }

  private static _updateDownstreamDependency(
    parentPackageName: string,
    dependencies: { [packageName: string]: string },
    change: IChangeInfo,
    allChanges: IChangeInfoHash,
    allPackages: Map<string, RushConfigurationProject>,
    prereleaseName: string
    ): void {

    if (dependencies && dependencies[change.packageName]) {
      const requiredVersion: string = dependencies[change.packageName];
      const alwaysUpdate: boolean = prereleaseName && !allChanges.hasOwnProperty(parentPackageName);

      // If the version range exists and has not yet been updated to this version, update it.
      if (requiredVersion !== change.newRangeDependency || alwaysUpdate) {

        // Either it already satisfies the new version, or doesn't.
        // If not, the downstream dep needs to be republished.
        const changeType: ChangeType = semver.satisfies(change.newVersion, requiredVersion) ?
          ChangeType.dependency :
          ChangeType.patch;

        const hasChanged: boolean = PublishUtilities._addChange({
          packageName: parentPackageName,
          changeType
        }, allChanges, allPackages);

        if (hasChanged || alwaysUpdate) {
          // Only re-evaluate downstream dependencies if updating the parent package's dependency
          // caused a version bump.
          PublishUtilities._updateDownstreamDependencies(
            allChanges[parentPackageName],
            allChanges,
            allPackages,
            prereleaseName
          );
        }
      }
    }
  }

  private static _updateDependencyVersion(
    packageName: string,
    dependencies: { [key: string]: string; },
    dependencyName: string,
    dependencyChange: IChangeInfo,
    allChanges: IChangeInfoHash,
    allPackages: Map<string, RushConfigurationProject>
  ): void {
    const currentDependencyVersion: string = dependencies[dependencyName];

    if (PublishUtilities.isRangeDependency(currentDependencyVersion)) {
      dependencies[dependencyName] = dependencyChange.newRangeDependency;
    } else if (currentDependencyVersion.lastIndexOf('~', 0) === 0) {
      dependencies[dependencyName] = '~' + dependencyChange.newVersion;
    } else if (currentDependencyVersion.lastIndexOf('^', 0) === 0) {
      dependencies[dependencyName] = '^' + dependencyChange.newVersion;
    } else {
      dependencies[dependencyName] = dependencyChange.newVersion;
    }

    // Add dependency version update comment.
    PublishUtilities._addChange(
      {
        packageName: packageName,
        changeType: ChangeType.dependency,
        comment:
          `Updating dependency "${dependencyName}" from \`${currentDependencyVersion}\`` +
          ` to \`${dependencies[dependencyName]}\``
      },
      allChanges,
      allPackages
    );
  }
}