/**
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 */

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
  RushConfigProject
} from '@microsoft/rush-lib';

export interface IChangeInfoHash {
  [key: string]: IChangeInfo;
}

/**
 * Finds change requests in the given folder.
 * @param changesPath Path to the changes folder.
 * @returns Dictionary of all change requests, keyed by package name.
 */
export function findChangeRequests(
  allPackages: Map<string, RushConfigProject>,
  changesPath: string
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

    for (const change of changeRequest.changes) {
      _addChange(change, allChanges, allPackages);
    }
  });

  // Update orders so that downstreams are marked to come after upstreams.
  for (const packageName in allChanges) {
    if (allChanges.hasOwnProperty(packageName)) {
      const change: IChangeInfo = allChanges[packageName];
      const project: RushConfigProject = allPackages.get(packageName);
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
export function sortChangeRequests(allChanges: IChangeInfoHash): IChangeInfo[] {
  return Object
    .keys(allChanges)
    .map(key => allChanges[key])
    .sort((a, b) => a.order < b.order ? -1 : 1);
}

/**
 * Given a single change request, updates the package json file with updated versions on disk.
 */
export function updatePackages(
  allChanges: IChangeInfoHash,
  allPackages: Map<string, RushConfigProject>,
  shouldCommit: boolean
): void {

  Object.keys(allChanges).forEach(packageName => _updatePackage(
    allChanges[packageName],
    allChanges,
    allPackages,
    shouldCommit));
}

export function isRangeDependency(version: string): boolean {
  const LOOSE_PKG_REGEX: RegExp = />=?(?:\d+\.){2}\d+\s+<(?:\d+\.){2}\d+/;

  return LOOSE_PKG_REGEX.test(version);
}

function _updatePackage(
  change: IChangeInfo,
  allChanges: IChangeInfoHash,
  allPackages: Map<string, RushConfigProject>,
  shouldCommit: boolean
): void {

  console.log(
    `${EOL}* ${shouldCommit ? 'APPLYING' : 'DRYRUN'}: ${ChangeType[change.changeType]} update ` +
    `for ${change.packageName} to ${change.newVersion}`
  );

  const project: RushConfigProject = allPackages.get(change.packageName);
  const pkg: IPackageJson = project.packageJson;
  const packagePath: string = path.join(project.projectFolder, 'package.json');

  pkg.version = change.newVersion;

  // Update the package's dependencies.
  if (pkg.dependencies) {
    Object.keys(pkg.dependencies).forEach(depName => {
      const depChange: IChangeInfo = allChanges[depName];

      if (depChange && depChange.changeType >= ChangeType.patch) {
        const currentDependencyVersion: string = pkg.dependencies[depName];

        if (isRangeDependency(currentDependencyVersion)) {
          pkg.dependencies[depName] = depChange.newRangeDependency;
        } else {
          pkg.dependencies[depName] = depChange.newVersion;
        }
      }
    });
  }

  change.changes.forEach(subChange => {
    if (subChange.comment) {
       console.log(` - [${ChangeType[subChange.changeType]}] ${subChange.comment}`);
    }
  });

  if (shouldCommit) {
    fsx.writeFileSync(packagePath, JSON.stringify(pkg, undefined, 2), 'utf8');
  }
}

function _addChange(
  change: IChangeInfo,
  allChanges: IChangeInfoHash,
  allPackages: Map<string, RushConfigProject>
  ): void {

  const packageName: string = change.packageName;
  const project: RushConfigProject = allPackages.get(packageName);

  if (!project) {
    throw new Error(
      `The package ${packageName} was requested for publishing but does not exist. Please fix change requests.`
      );
  }

  const pkg: IPackageJson = project.packageJson;
  let currentChange: IChangeInfo;

  // If the given change does not have a changeType, derive it from the "type" string.
  if (change.changeType === undefined) {
    change.changeType = ChangeType[change.type];
  }

  if (!allChanges[packageName]) {
    currentChange = allChanges[packageName] = {
      packageName,
      changeType: change.changeType,
      order: 0,
      changes: [change]
    };
  } else {
    currentChange = allChanges[packageName];
    currentChange.changeType = Math.max(currentChange.changeType, change.changeType);
    currentChange.changes.push(change);
  }

  currentChange.newVersion = change.changeType >= ChangeType.patch ?
    semver.inc(pkg.version, ChangeType[currentChange.changeType]) :
    pkg.version;

  currentChange.newRangeDependency = `>=${currentChange.newVersion} <${semver.inc(currentChange.newVersion, 'major')}`;

  _updateDownstreamDependencies(currentChange, allChanges, allPackages);
}

function _updateDownstreamDependencies(
  change: IChangeInfo,
  allChanges: IChangeInfoHash,
  allPackages: Map<string, RushConfigProject>
): void {

  const packageName: string = change.packageName;
  const downstreamNames: string[] = allPackages.get(packageName).downstreamDependencyProjects;

  // Iterate through all downstream dependencies for the package.
  if (change.changeType >= ChangeType.patch && downstreamNames) {
    for (const depName of downstreamNames) {
      const pkg: IPackageJson = allPackages.get(depName).packageJson;
      const requiredVersion: string = pkg.dependencies[packageName];

      // If the version range has not yet been updated to this version, update it.
      if (requiredVersion !== change.newRangeDependency) {

        // Either it already satisfies the new version, or doesn't. If not, the downstream dep needs to be republished.
        const changeType: ChangeType = semver.satisfies(change.newVersion, requiredVersion) ?
          ChangeType.dependency :
          ChangeType.patch;

        _addChange({
          packageName: pkg.name,
          changeType,
          comment: `Updating dependency version for ${packageName} (was ${requiredVersion})`
        }, allChanges, allPackages);
      }
    }
  }
}
