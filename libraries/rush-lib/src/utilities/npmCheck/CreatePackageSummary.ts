// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { existsSync } from 'node:fs';
import path from 'node:path';

import _ from 'lodash';
import semver from 'semver';

import type { INpmCheckState, INpmCheckPackageJson } from './interfaces/INpmCheck';
import type { INpmCheckPackageSummary, INpmCheckVersionBumpType } from './interfaces/INpmCheckPackageSummary';
import findModulePath from './FindModulePath';
import readPackageJson from './ReadPackageJson';
import getLatestFromRegistry from './GetLatestFromRegistry';
import type { INpmRegistryInfo } from './interfaces/INpmCheckRegistry';

export default async function createPackageSummary(
  moduleName: string,
  state: INpmCheckState
): Promise<INpmCheckPackageSummary | false> {
  const cwdPackageJson: INpmCheckPackageJson | undefined = state.cwdPackageJson;

  const modulePath: string = findModulePath(moduleName, state);
  const packageIsInstalled: boolean = existsSync(modulePath);
  const modulePackageJson: INpmCheckPackageJson = readPackageJson(path.join(modulePath, 'package.json'));

  // Ignore private packages
  const isPrivate: boolean = Boolean(modulePackageJson.private);
  if (isPrivate) {
    return false;
  }

  // Ignore packages that are using github or file urls
  const packageJsonVersion: string | undefined =
    cwdPackageJson?.dependencies[moduleName] || cwdPackageJson?.devDependencies[moduleName];
  if (packageJsonVersion && !semver.validRange(packageJsonVersion)) {
    return false;
  }

  return getLatestFromRegistry(moduleName).then((fromRegistry: INpmRegistryInfo) => {
    const installedVersion: string | undefined = modulePackageJson.version;
    const latest: string | undefined =
      installedVersion &&
      fromRegistry.latest &&
      fromRegistry.next &&
      semver.gt(installedVersion, fromRegistry.latest)
        ? fromRegistry.next
        : fromRegistry.latest;
    const versions: string[] = fromRegistry.versions || [];
    let versionWanted: string | null = null;
    if (packageJsonVersion) {
      versionWanted = semver.maxSatisfying(versions, packageJsonVersion);
    }
    const versionToUse: string | undefined | null = installedVersion || versionWanted;
    const usingNonSemver: boolean | '' | null =
      latest !== undefined && semver.valid(latest) && semver.lt(latest, '1.0.0-pre');

    let bump: INpmCheckVersionBumpType;
    const bumpRaw: INpmCheckVersionBumpType =
      semver.valid(latest) &&
      semver.valid(versionToUse) &&
      (usingNonSemver && versionToUse && latest
        ? semver.diff(versionToUse, latest)
          ? 'nonSemver'
          : semver.diff(versionToUse, latest)
        : versionToUse && latest
          ? semver.diff(versionToUse, latest)
          : undefined);
    if (bumpRaw && bumpRaw !== null) {
      bump = bumpRaw as INpmCheckVersionBumpType;
    } else {
      bump = undefined;
    }

    return {
      // info
      moduleName: moduleName,
      homepage: fromRegistry.homepage ?? '',
      regError: new Error(fromRegistry.error),
      pkgError: modulePackageJson.error,

      // versions
      latest: latest ?? '',
      installed: versionToUse === null ? '' : versionToUse,
      notInstalled: !packageIsInstalled,
      packageJson: packageJsonVersion ?? '',

      // meta
      devDependency: _.has(cwdPackageJson?.devDependencies, moduleName),
      mismatch:
        packageJsonVersion !== undefined &&
        versionToUse !== null &&
        semver.validRange(packageJsonVersion) &&
        semver.valid(versionToUse)
          ? !semver.satisfies(versionToUse, packageJsonVersion)
          : false,
      bump: bump
    };
  });
}
