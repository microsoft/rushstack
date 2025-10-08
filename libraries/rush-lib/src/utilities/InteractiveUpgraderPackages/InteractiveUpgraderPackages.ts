// See npm-check-license for license information.

/// <reference path="./types/giturl-typings.d.ts" preserve="true" />

import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import gitUrl from 'giturl';
import _ from 'lodash';
import packageJson from 'package-json';
import semver from 'semver';
import throat from 'throat';

import type { IPackageJson } from '@rushstack/node-core-library';

import type { IPackageInfo, IVersionBumpType } from './interfaces/IPackageInfo';
import type { INpmRegistryInfo, IPackageVersion, IRegistryData } from './interfaces/INpmRegistryInfo';

interface IPackageJsonWithError extends IPackageJson {
  error?: Error;
}

export default class InteractiveUpgraderPackages {
  private _cpuCount: number = os.cpus().length;

  public constructor() {
    this._cpuCount = os.cpus().length;
  }
  public async getPackagesAsync(projectFolder: string): Promise<IPackageInfo[]> {
    const cwd: string = path.resolve(projectFolder);
    const cwdPackageJson: IPackageJsonWithError = this._getPackageJson(path.join(cwd, 'package.json'));

    const allDependencies: Record<string, string> | undefined = this._getAllDependencies(cwdPackageJson);

    let packages: IPackageInfo[] = [];
    if (allDependencies) {
      const packageSummaryPromises: Promise<IPackageInfo | boolean>[] = Object.keys(allDependencies).map(
        (moduleName: string) => this._createPackageSummary(moduleName, cwd, cwdPackageJson)
      );
      packages = await Promise.all(packageSummaryPromises).then((results: (IPackageInfo | boolean)[]) => {
        return results.filter((pkg): pkg is IPackageInfo => pkg !== false);
      });
    }

    return packages;
  }

  private _getPackageJson(filename: string): IPackageJsonWithError {
    let pkg: IPackageJsonWithError | undefined = undefined;
    let error: Error | undefined = undefined;
    try {
      pkg = require(filename);
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'code' in e && e.code === 'MODULE_NOT_FOUND') {
        error = new Error(`A package.json was not found at ${filename}`);
      } else {
        error = new Error(`A package.json was found at ${filename}, but it is not valid.`);
      }
    }
    return _.extend({ devDependencies: {}, dependencies: {}, error: error }, pkg);
  }

  private _getAllDependencies(pkg: IPackageJsonWithError | undefined): Record<string, string> | undefined {
    if (!pkg) {
      return undefined;
    }

    return _.extend(pkg.dependencies, pkg.devDependencies);
  }

  private _createPackageSummary(
    moduleName: string,
    cwd: string,
    cwdPackageJson: IPackageJsonWithError
  ): Promise<IPackageInfo | boolean> {
    const modulePath: string = this._findModulePath(moduleName, cwd);
    const packageIsInstalled: boolean = existsSync(modulePath);
    const modulePackageJson: IPackageJsonWithError = this._getPackageJson(
      path.join(modulePath, 'package.json')
    );

    // Ignore private packages
    const isPrivate: boolean = Boolean(modulePackageJson.private);
    if (isPrivate) {
      return Promise.resolve(false);
    }

    // Ignore packages that are using github or file urls
    const packageJsonVersion: string | undefined =
      cwdPackageJson &&
      (cwdPackageJson.dependencies?.[moduleName] ?? cwdPackageJson.devDependencies?.[moduleName]);
    if (packageJsonVersion && !semver.validRange(packageJsonVersion)) {
      return Promise.resolve(false);
    }

    return this._getLatestFromRegistry(moduleName).then((fromRegistry: INpmRegistryInfo) => {
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

      let bump: IVersionBumpType;
      const bumpRaw: IVersionBumpType =
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
        bump = bumpRaw as IVersionBumpType;
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

  private _findModulePath(moduleName: string, cwd: string): string {
    // Module._nodeModulePaths does not include some places the node module resolver searches, such as
    // the global prefix or other special directories. This is desirable because if a module is missing
    // in the project directory we want to be sure to report it as missing.
    // We can't use require.resolve because it fails if the module doesn't have an entry point.
    // @ts-ignore
    const nodeModulesPaths: string[] = Module._nodeModulePaths(cwd);
    const possibleModulePaths: string[] = nodeModulesPaths.map((x) => path.join(x, moduleName));
    const modulePath: string | undefined = possibleModulePaths.find((p) => existsSync(p));
    // if no existing path was found, return the first tried path anyway
    return modulePath || path.join(cwd, moduleName);
  }

  private _getLatestFromRegistry(packageName: string): Promise<INpmRegistryInfo> {
    const limit: () => Promise<packageJson.FullMetadata> = throat(this._cpuCount, () =>
      packageJson(packageName, { fullMetadata: true, allVersions: true })
    );
    return limit()
      .then((rawData: packageJson.FullMetadata) => {
        const CRAZY_HIGH_SEMVER: string = '8000.0.0';
        const sortedVersions: string[] = _(rawData.versions)
          .keys()
          .remove(_.partial(semver.gt, CRAZY_HIGH_SEMVER))
          .sort(semver.compare)
          .valueOf();

        const latest: string = rawData['dist-tags'].latest;
        const next: string = rawData['dist-tags'].next;
        const latestStableRelease: string | undefined = semver.satisfies(latest, '*')
          ? latest
          : semver.maxSatisfying(sortedVersions, '*') || '';

        return {
          latest: latestStableRelease,
          next: next,
          versions: sortedVersions,
          homepage: this._getBestGuessHomepage(rawData) || ''
        };
      })
      .catch((error) => {
        const errorMessage: string = `Registry error ${error.message}`;
        return {
          error: errorMessage
        };
      });
  }

  private _getBestGuessHomepage(data: IRegistryData | undefined): string | false {
    if (!data) {
      return false;
    }
    const packageDataForLatest: IPackageVersion = data.versions[data['dist-tags'].latest];

    return packageDataForLatest
      ? packageDataForLatest.homepage ||
          (packageDataForLatest.bugs &&
            packageDataForLatest.bugs.url &&
            gitUrl.parse(packageDataForLatest.bugs.url.trim())) ||
          (packageDataForLatest.repository &&
            packageDataForLatest.repository.url &&
            gitUrl.parse(packageDataForLatest.repository.url.trim())) ||
          false
      : false;
  }
}
