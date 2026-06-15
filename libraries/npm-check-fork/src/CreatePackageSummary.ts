import { existsSync } from 'node:fs';
import path from 'node:path';

import semver, { type ReleaseType } from 'semver';

import type { INpmCheckState, INpmCheckPackageJson } from './interfaces/INpmCheck.ts';
import type { INpmCheckPackageSummary, INpmCheckVersionBumpType } from './interfaces/INpmCheckPackageSummary';
import type { INpmRegistryInfo } from './interfaces/INpmCheckRegistry';
import findModulePath from './FindModulePath';
import getLatestFromRegistry from './GetLatestFromRegistry';
import readPackageJson from './ReadPackageJson';

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
    let bump: INpmCheckVersionBumpType;
    if (versionToUse && latest && semver.valid(latest) && semver.valid(versionToUse)) {
      const diff: ReleaseType | null = semver.diff(versionToUse, latest);
      if (diff) {
        const usingNonSemver: boolean = semver.lt(latest, '1.0.0-pre');
        if (usingNonSemver) {
          bump = 'nonSemver';
        } else {
          bump = diff;
        }
      }
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
      // TODO: Replace with Object.hasOwn() when the TypeScript target library is upgraded to es2022+
      devDependency: Object.prototype.hasOwnProperty.call(cwdPackageJson?.devDependencies, moduleName),
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
