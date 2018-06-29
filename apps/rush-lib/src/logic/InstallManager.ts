// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as glob from 'glob';
import * as colors from 'colors';
import * as fetch from 'node-fetch';
import * as http from 'http';
import HttpsProxyAgent = require('https-proxy-agent');
import * as os from 'os';
import * as path from 'path';
import * as fsx from 'fs-extra';
import * as semver from 'semver';
import * as tar from 'tar';
import globEscape = require('glob-escape');
import {
  JsonFile,
  LockFile,
  Text,
  IPackageJson,
  MapExtensions
} from '@microsoft/node-core-library';

import { ApprovedPackagesChecker } from '../logic/ApprovedPackagesChecker';
import { AsyncRecycler } from '../utilities/AsyncRecycler';
import { BaseLinkManager } from '../logic/base/BaseLinkManager';
import { BaseShrinkwrapFile } from '../logic/base/BaseShrinkwrapFile';
import { GitPolicy } from '../logic/GitPolicy';
import { IRushTempPackageJson } from '../logic/base/BasePackage';
import { LastInstallFlag } from '../api/LastInstallFlag';
import { LinkManagerFactory } from '../logic/LinkManagerFactory';
import { PurgeManager } from './PurgeManager';
import { RushConfiguration, PackageManager } from '../api/RushConfiguration';
import { RushConfigurationProject } from '../api/RushConfigurationProject';
import { RushConstants } from '../logic/RushConstants';
import { ShrinkwrapFileFactory } from '../logic/ShrinkwrapFileFactory';
import { Stopwatch } from '../utilities/Stopwatch';
import { Utilities } from '../utilities/Utilities';
import { Rush } from '../api/Rush';
import { AlreadyReportedError } from '../utilities/AlreadyReportedError';

const MAX_INSTALL_ATTEMPTS: number = 5;

/**
 * The "noMtime" flag is new in tar@4.4.1 and not available yet for \@types/tar.
 * As a temporary workaround, augment the type.
 */
import { CreateOptions } from 'tar';
export interface CreateOptions { // tslint:disable-line:interface-name
  /**
   * "Set to true to omit writing mtime values for entries. Note that this prevents using other
   * mtime-based features like tar.update or the keepNewer option with the resulting tar archive."
   */
  noMtime?: boolean;
}

export interface IInstallManagerOptions {
  /**
   * Whether or not Rush will automatically update the shrinkwrap file.
   * True for "rush update", false for "rush install".
   */
  allowShrinkwrapUpdates: boolean;
  /**
   * Whether to skip policy checks.
   */
  bypassPolicy: boolean;
  /**
   * Whether to skip linking, i.e. require "rush link" to be done manually later.
   */
  noLink: boolean;
  /**
   * Whether to delete the shrinkwrap file before installation, i.e. so that all dependenices
   * will be upgraded to the latest SemVer-compatible version.
   */
  fullUpgrade: boolean;
  /**
   * Whether to force an update to the shrinkwrap file even if it appears to be unnecessary.
   * Normally Rush uses heuristics to determine when "pnpm install" can be skipped,
   * but sometimes the heuristics can be inaccurate due to external influences
   * (pnpmfile.js script logic, registry changes, etc).
   */
  recheckShrinkwrap: boolean;
}

/**
 * This class implements common logic between "rush install" and "rush update".
 */
export class InstallManager {
  private _rushConfiguration: RushConfiguration;
  private _commonNodeModulesMarker: LastInstallFlag;
  private _commonTempFolderRecycler: AsyncRecycler;

  /**
   * Returns a map of all direct dependencies that only have a single semantic version specifier
   */
  public static collectImplicitlyPreferredVersions(rushConfiguration: RushConfiguration): Map<string, string> {
    // First, collect all the direct dependencies of all local projects, and their versions:
    // direct dependency name --> set of version specifiers
    const versionsForDependencies: Map<string, Set<string>> = new Map<string, Set<string>>();

    rushConfiguration.projects.forEach((project: RushConfigurationProject) => {
      InstallManager._collectVersionsForDependencies(versionsForDependencies, project.packageJson.dependencies,
        project.cyclicDependencyProjects, rushConfiguration);
      InstallManager._collectVersionsForDependencies(versionsForDependencies, project.packageJson.devDependencies,
        project.cyclicDependencyProjects, rushConfiguration);
    });

    // If any dependency has more than one version, then filter it out (since we don't know which version
    // should be preferred).  What remains will be the list of preferred dependencies.
    // dependency --> version specifier
    const implicitlyPreferred: Map<string, string> = new Map<string, string>();
    versionsForDependencies.forEach((versions: Set<string>, dep: string) => {
      if (versions.size === 1) {
        const version: string = versions.values().next().value;
        implicitlyPreferred.set(dep, version);
      }
    });
    return implicitlyPreferred;
  }

  // Helper for collectImplicitlyPreferredVersions()
  private static _updateVersionsForDependencies(versionsForDependencies: Map<string, Set<string>>,
    dependency: string, version: string): void {
    if (!versionsForDependencies.has(dependency)) {
      versionsForDependencies.set(dependency, new Set<string>());
    }
    versionsForDependencies.get(dependency)!.add(version);
  }

  // Helper for collectImplicitlyPreferredVersions()
  private static _collectVersionsForDependencies(versionsForDependencies: Map<string, Set<string>>,
    dependencies: { [dep: string]: string } | undefined,
    cyclicDependencies: Set<string>, rushConfiguration: RushConfiguration): void {

    const allowedAlternativeVersions: Map<string, ReadonlyArray<string>>
      = rushConfiguration.commonVersions.allowedAlternativeVersions;

    if (dependencies) {
      Object.keys(dependencies).forEach((dependency: string) => {
        const versionSpecifier: string = dependencies[dependency];
        const alternativesForThisDependency: ReadonlyArray<string> = allowedAlternativeVersions.get(dependency) || [];

        // For each dependency, collectImplicitlyPreferredVersions() is collecting the set of all version specifiers
        // that appear across the repo.  If there is only one version specifier, then that's the "preferred" one.
        // However, there are a few cases where additional version specifiers can be safely ignored.
        let ignoreVersion: boolean = false;

        // 1. If the version specifier was listed in "allowedAlternativeVersions", then it's never a candidate.
        //    (Even if it's the only version specifier anywhere in the repo, we still ignore it, because
        //    otherwise the rule would be difficult to explain.)
        if (alternativesForThisDependency.indexOf(versionSpecifier) > 0) {
          ignoreVersion = true;
        } else {
          // Is it a local project?
          const localProject: RushConfigurationProject | undefined = rushConfiguration.getProjectByName(dependency);
          if (localProject) {
            // 2. If it's a symlinked local project, then it's not a candidate, because the package manager will
            //    never even see it.
            // However there are two ways that a local project can NOT be symlinked:
            // - if the local project doesn't satisfy the referenced semver specifier; OR
            // - if the local project was specified in "cyclicDependencyProjects" in rush.json
            if (semver.satisfies(localProject.packageJson.version, versionSpecifier)
              && !cyclicDependencies.has(dependency)) {
              ignoreVersion = true;
            }
          }
        }

        if (!ignoreVersion) {
          InstallManager._updateVersionsForDependencies(versionsForDependencies, dependency, versionSpecifier);
        }
      });
    }
  }

  public get commonNodeModulesMarker(): LastInstallFlag {
    return this._commonNodeModulesMarker;
  }

  constructor(rushConfiguration: RushConfiguration, purgeManager: PurgeManager) {
    this._rushConfiguration = rushConfiguration;
    this._commonTempFolderRecycler = purgeManager.commonTempFolderRecycler;

    this._commonNodeModulesMarker = new LastInstallFlag(this._rushConfiguration.commonTempFolder, {
      node: process.versions.node,
      packageManager: rushConfiguration.packageManager,
      packageManagerVersion: rushConfiguration.packageManagerToolVersion
    });
  }

  public doInstall(options: IInstallManagerOptions): Promise<void> {
    return Promise.resolve().then(() => {

      // Check the policies
      if (!options.bypassPolicy) {
        if (!GitPolicy.check(this._rushConfiguration)) {
          throw new AlreadyReportedError();
        }

        ApprovedPackagesChecker.rewriteConfigFiles(this._rushConfiguration);
      }

      // Ensure that the package manager is installed
      return this.ensureLocalPackageManager()
        .then(() => {
          let shrinkwrapFile: BaseShrinkwrapFile | undefined = undefined;

          // (If it's a full update, then we ignore the shrinkwrap from Git since it will be overwritten)
          if (!options.fullUpgrade) {
            try {
              shrinkwrapFile = ShrinkwrapFileFactory.getShrinkwrapFile(this._rushConfiguration.packageManager,
                this._rushConfiguration.committedShrinkwrapFilename);
            } catch (ex) {
              console.log();
              console.log('Unable to load the shrinkwrap file: ' + ex.message);

              if (!options.allowShrinkwrapUpdates) {
                console.log();
                console.log(colors.red('You need to run "rush update" to fix this problem'));
                throw new AlreadyReportedError();
              }

              shrinkwrapFile = undefined;
            }
          }

          const shrinkwrapIsUpToDate: boolean = this._createTempModulesAndCheckShrinkwrap(shrinkwrapFile)
            && !options.recheckShrinkwrap;

          if (!shrinkwrapIsUpToDate) {
            if (!options.allowShrinkwrapUpdates) {
              console.log();
              console.log(colors.red('The shrinkwrap file is out of date.  You need to run "rush update".'));
              throw new AlreadyReportedError();
            }
          }

          return this._installCommonModules(shrinkwrapIsUpToDate, options.allowShrinkwrapUpdates)
            .then(() => {
              if (!options.noLink) {
                const linkManager: BaseLinkManager = LinkManagerFactory.getLinkManager(this._rushConfiguration);
                return linkManager.createSymlinksForProjects(false);
              } else {
                console.log(os.EOL
                  + colors.yellow('Since "--no-link" was specified, you will need to run "rush link" manually.'));
              }
            });
        });
    });
  }

  /**
   * If the "(p)npm-local" symlink hasn't been set up yet, this creates it, installing the
   * specified (P)npm version in the user's home directory if needed.
   */
  public ensureLocalPackageManager(): Promise<void> {
    // Example: "C:\Users\YourName\.rush"
    const rushUserFolder: string = this._rushConfiguration.rushUserFolder;

    if (!fsx.existsSync(rushUserFolder)) {
      console.log('Creating ' + rushUserFolder);
      fsx.mkdirSync(rushUserFolder);
    }

    const packageManager: PackageManager = this._rushConfiguration.packageManager;
    const packageManagerVersion: string = this._rushConfiguration.packageManagerToolVersion;

    const packageManagerAndVersion: string = `${packageManager}-${packageManagerVersion}`;
    // Example: "C:\Users\YourName\.rush\pnpm-1.2.3"
    const packageManagerToolFolder: string = path.join(rushUserFolder, packageManagerAndVersion);

    const packageManagerMarker: LastInstallFlag = new LastInstallFlag(packageManagerToolFolder, {
      node: process.versions.node
    });

    console.log(`Trying to acquire lock for ${packageManagerAndVersion}`);
    return LockFile.acquire(rushUserFolder, packageManagerAndVersion).then((lock: LockFile) => {
      console.log(`Acquired lock for ${packageManagerAndVersion}`);

      if (!packageManagerMarker.isValid() || lock.dirtyWhenAcquired) {
        console.log(colors.bold(`Installing ${packageManager} version ${packageManagerVersion}${os.EOL}`));

        // note that this will remove the last-install flag from the directory
        Utilities.installPackageInDirectory({
          directory: packageManagerToolFolder,
          packageName: packageManager,
          version: this._rushConfiguration.packageManagerToolVersion,
          tempPackageTitle: `${packageManager}-local-install`,
          maxInstallAttempts: MAX_INSTALL_ATTEMPTS,
          // This is using a local configuration to install a package in a shared global location.
          // Generally that's a bad practice, but in this case if we can successfully install
          // the package at all, we can reasonably assume it's good for all the repositories.
          // In particular, we'll assume that two different NPM registries cannot have two
          // different implementations of the same version of the same package.
          // This was needed for: https://github.com/Microsoft/web-build-tools/issues/691
          commonRushConfigFolder: this._rushConfiguration.commonRushConfigFolder
        });

        console.log(`Successfully installed ${packageManager} version ${packageManagerVersion}`);
      } else {
        console.log(`Found ${packageManager} version ${packageManagerVersion} in ${packageManagerToolFolder}`);
      }

      packageManagerMarker.create();

      // Example: "C:\MyRepo\common\temp"
      if (!fsx.existsSync(this._rushConfiguration.commonTempFolder)) {
        fsx.mkdirsSync(this._rushConfiguration.commonTempFolder);
      }

      // Example: "C:\MyRepo\common\temp\pnpm-local"
      const localPackageManagerToolFolder: string =
        path.join(this._rushConfiguration.commonTempFolder, `${packageManager}-local`);

      console.log(os.EOL + 'Symlinking "' + localPackageManagerToolFolder + '"');
      console.log('  --> "' + packageManagerToolFolder + '"');

      // We cannot use fsx.existsSync() to test the existence of a symlink, because it will
      // return false for broken symlinks.  There is no way to test without catching an exception.
      try {
        fsx.unlinkSync(localPackageManagerToolFolder);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }

      fsx.symlinkSync(packageManagerToolFolder, localPackageManagerToolFolder, 'junction');

      lock.release();
    });
  }

  /**
   * Regenerates the common/package.json and all temp_modules projects.
   * If shrinkwrapFile is provided, this function also validates whether it contains
   * everything we need to install and returns true if so; in all other cases,
   * the return value is false.
   */
  private _createTempModulesAndCheckShrinkwrap(
    shrinkwrapFile: BaseShrinkwrapFile | undefined
  ): boolean {
    const stopwatch: Stopwatch = Stopwatch.start();

    // Example: "C:\MyRepo\common\temp\projects"
    const tempProjectsFolder: string = path.join(this._rushConfiguration.commonTempFolder,
      RushConstants.rushTempProjectsFolderName);

    console.log(os.EOL + colors.bold('Updating temp projects in ' + tempProjectsFolder));

    Utilities.createFolderWithRetry(tempProjectsFolder);

    const shrinkwrapWarnings: string[] = [];

    // We will start with the assumption that it's valid, and then set it to false if
    // any of the checks fail
    let shrinkwrapIsUpToDate: boolean = true;

    if (!shrinkwrapFile) {
      shrinkwrapIsUpToDate = false;
    }

    const allExplicitPreferredVersions: Map<string, string> = this._rushConfiguration.commonVersions
      .getAllPreferredVersions();

    if (shrinkwrapFile) {
      // Check any (explicitly) preferred dependencies first
      allExplicitPreferredVersions.forEach((version: string, dependency: string) => {
        if (!shrinkwrapFile.hasCompatibleTopLevelDependency(dependency, version)) {
          shrinkwrapWarnings.push(`"${dependency}" (${version}) required by the preferred versions from `
            + RushConstants.commonVersionsFilename);
          shrinkwrapIsUpToDate = false;
        }
      });

      if (this._findOrphanedTempProjects(shrinkwrapFile)) {
        // If there are any orphaned projects, then "npm install" would fail because the shrinkwrap
        // contains references such as "resolved": "file:projects\\project1" that refer to nonexistent
        // file paths.
        shrinkwrapIsUpToDate = false;
      }
    }

    // Also copy down the committed .npmrc file, if there is one
    // "common\config\rush\.npmrc" --> "common\temp\.npmrc"
    // Also ensure that we remove any old one that may be hanging around
    Utilities.syncNpmrc(this._rushConfiguration.commonRushConfigFolder, this._rushConfiguration.commonTempFolder);

    // also, copy the pnpmfile.js if it exists
    if (this._rushConfiguration.packageManager === 'pnpm') {
      const committedPnpmFilePath: string
        = path.join(this._rushConfiguration.commonRushConfigFolder, RushConstants.pnpmFileFilename);
      const tempPnpmFilePath: string
        = path.join(this._rushConfiguration.commonTempFolder, RushConstants.pnpmFileFilename);

      // ensure that we remove any old one that may be hanging around
      this._syncFile(committedPnpmFilePath, tempPnpmFilePath);
    }

    const commonPackageJson: IPackageJson = {
      dependencies: {},
      description: 'Temporary file generated by the Rush tool',
      name: 'rush-common',
      private: true,
      version: '0.0.0'
    };

    // Find the implicitly preferred versions
    // These are any first-level dependencies for which we only consume a single version range
    // (e.g. every package that depends on react uses an identical specifier)
    const allPreferredVersions: Map<string, string> =
      InstallManager.collectImplicitlyPreferredVersions(this._rushConfiguration);

    // Add in the explicitly preferred versions.
    // Note that these take precedence over implicitly preferred versions.
    MapExtensions.mergeFromMap(allPreferredVersions, allExplicitPreferredVersions);

    // Add any preferred versions to the top of the commonPackageJson
    // do this in alphabetical order for simpler debugging
    for (const dependency of Array.from(allPreferredVersions.keys()).sort()) {
      commonPackageJson.dependencies![dependency] = allPreferredVersions.get(dependency)!;
    }

    // To make the common/package.json file more readable, sort alphabetically
    // according to rushProject.tempProjectName instead of packageName.
    const sortedRushProjects: RushConfigurationProject[] = this._rushConfiguration.projects.slice(0);
    sortedRushProjects.sort(
      (a: RushConfigurationProject, b: RushConfigurationProject) => a.tempProjectName.localeCompare(b.tempProjectName)
    );

    for (const rushProject of sortedRushProjects) {
      const packageJson: IPackageJson = rushProject.packageJson;

      // Example: "C:\MyRepo\common\temp\projects\my-project-2.tgz"
      const tarballFile: string = this._getTarballFilePath(rushProject);

      // Example: "my-project-2"
      const unscopedTempProjectName: string = rushProject.unscopedTempProjectName;

      // Example: dependencies["@rush-temp/my-project-2"] = "file:./projects/my-project-2.tgz"
      commonPackageJson.dependencies![rushProject.tempProjectName]
        = `file:./${RushConstants.rushTempProjectsFolderName}/${rushProject.unscopedTempProjectName}.tgz`;

      const tempPackageJson: IRushTempPackageJson = {
        name: rushProject.tempProjectName,
        version: '0.0.0',
        private: true,
        dependencies: {}
      };

      // If there are any optional dependencies, copy them over directly
      if (packageJson.optionalDependencies) {
        tempPackageJson.optionalDependencies = packageJson.optionalDependencies;
      }

      // Collect pairs of (packageName, packageVersion) to be added as temp package dependencies
      const pairs: { packageName: string, packageVersion: string }[] = [];

      // If there are devDependencies, we need to merge them with the regular
      // dependencies.  If the same library appears in both places, then the
      // regular dependency takes precedence over the devDependency.
      // It also takes precedence over a duplicate in optionalDependencies,
      // but NPM will take care of that for us.  (Frankly any kind of duplicate
      // should be an error, but NPM is pretty lax about this.)
      if (packageJson.devDependencies) {
        for (const packageName of Object.keys(packageJson.devDependencies)) {
          pairs.push({ packageName: packageName, packageVersion: packageJson.devDependencies[packageName] });
        }
      }

      if (packageJson.dependencies) {
        for (const packageName of Object.keys(packageJson.dependencies)) {
          pairs.push({ packageName: packageName, packageVersion: packageJson.dependencies[packageName] });
        }
      }

      for (const pair of pairs) {
        // Is there a locally built Rush project that could satisfy this dependency?
        // If so, then we will symlink to the project folder rather than to common/temp/node_modules.
        // In this case, we don't want "npm install" to process this package, but we do need
        // to record this decision for "rush link" later, so we add it to a special 'rushDependencies' field.
        const localProject: RushConfigurationProject | undefined =
          this._rushConfiguration.getProjectByName(pair.packageName);
        if (localProject) {

          // Don't locally link if it's listed in the cyclicDependencyProjects
          if (!rushProject.cyclicDependencyProjects.has(pair.packageName)) {

            // Also, don't locally link if the SemVer doesn't match
            const localProjectVersion: string = localProject.packageJson.version;
            if (semver.satisfies(localProjectVersion, pair.packageVersion)) {

              // We will locally link this package
              if (!tempPackageJson.rushDependencies) {
                tempPackageJson.rushDependencies = {};
              }
              tempPackageJson.rushDependencies[pair.packageName] = pair.packageVersion;
              continue;
            }
          }
        }

        // We will NOT locally link this package; add it as a regular dependency.
        tempPackageJson.dependencies![pair.packageName] = pair.packageVersion;

        if (shrinkwrapFile) {
          if (!shrinkwrapFile.tryEnsureCompatibleDependency(pair.packageName, pair.packageVersion,
            rushProject.tempProjectName)) {
              shrinkwrapWarnings.push(`"${pair.packageName}" (${pair.packageVersion}) required by`
                + ` "${rushProject.packageName}"`);
            shrinkwrapIsUpToDate = false;
          }
        }
      }

      // NPM expects the root of the tarball to have a directory called 'package'
      const npmPackageFolder: string = 'package';

      // Example: "C:\MyRepo\common\temp\projects\my-project-2"
      const tempProjectFolder: string = path.join(
        this._rushConfiguration.commonTempFolder,
        RushConstants.rushTempProjectsFolderName,
        unscopedTempProjectName);

      // Example: "C:\MyRepo\common\temp\projects\my-project-2\package.json"
      const tempPackageJsonFilename: string = path.join(tempProjectFolder, RushConstants.packageJsonFilename);

      // we only want to overwrite the package if the existing tarball's package.json is different from tempPackageJson
      let shouldOverwrite: boolean = true;
      try {
        // if the tarball and the temp file still exist, then compare the contents
        if (fsx.existsSync(tarballFile) && fsx.existsSync(tempPackageJsonFilename)) {

          // compare the extracted package.json with the one we are about to write
          const oldBuffer: Buffer = fsx.readFileSync(tempPackageJsonFilename);
          const newBuffer: Buffer = new Buffer(JsonFile.stringify(tempPackageJson));

          if (Buffer.compare(oldBuffer, newBuffer) === 0) {
            shouldOverwrite = false;
          }
        }
      } catch (error) {
        // ignore the error, we will go ahead and create a new tarball
      }

      if (shouldOverwrite) {
        try {
          // ensure the folder we are about to zip exists
          Utilities.createFolderWithRetry(tempProjectFolder);

          // remove the old tarball & old temp package json, this is for any cases where new tarball creation
          // fails, and the shouldOverwrite logic is messed up because the my-project-2\package.json
          // exists and is updated, but the tarball is not accurate
          fsx.removeSync(tarballFile);
          fsx.removeSync(tempPackageJsonFilename);

          // write the expected package.json file into the zip staging folder
          JsonFile.save(tempPackageJson, tempPackageJsonFilename);

          // create the new tarball
          tar.create({
            gzip: true,
            file: tarballFile,
            cwd: tempProjectFolder,
            portable: true,
            noMtime: true,
            noPax: true,
            sync: true,
            prefix: npmPackageFolder
          } as CreateOptions, ['package.json']);

          console.log(`Updating ${tarballFile}`);
        } catch (error) {
          // delete everything in case of any error
          fsx.removeSync(tarballFile);
          fsx.removeSync(tempPackageJsonFilename);
        }
      }
    }

    // Example: "C:\MyRepo\common\temp\package.json"
    const commonPackageJsonFilename: string = path.join(this._rushConfiguration.commonTempFolder,
      RushConstants.packageJsonFilename);

    if (shrinkwrapFile) {
      // If we have a (possibly incomplete) shrinkwrap file, save it as the temporary file.
      shrinkwrapFile.save(this._rushConfiguration.tempShrinkwrapFilename);
      shrinkwrapFile.save(this._rushConfiguration.tempShrinkwrapPreinstallFilename);
    } else {
      // Otherwise delete the temporary file
      fsx.removeSync(this._rushConfiguration.tempShrinkwrapFilename);
    }

    // Don't update the file timestamp unless the content has changed, since "rush install"
    // will consider this timestamp
    JsonFile.save(commonPackageJson, commonPackageJsonFilename, { onlyIfChanged: true });

    stopwatch.stop();
    console.log(`Finished creating temporary modules (${stopwatch.toString()})`);

    if (shrinkwrapWarnings.length > 0) {
      console.log();
      console.log(colors.yellow(Utilities.wrapWords(`The shrinkwrap file is missing the following dependencies:`)));
      for (const shrinkwrapWarning of shrinkwrapWarnings) {
        console.log(colors.yellow('  ' + shrinkwrapWarning));
      }
      console.log();
    }

    return shrinkwrapIsUpToDate;
  }

  /**
   * Runs "npm install" in the common folder.
   */
  private _installCommonModules(shrinkwrapIsUpToDate: boolean, allowShrinkwrapUpdates: boolean): Promise<void> {
    return Promise.resolve().then(() => {
      console.log(os.EOL + colors.bold('Checking node_modules in ' + this._rushConfiguration.commonTempFolder)
        + os.EOL);

      const commonNodeModulesFolder: string = path.join(this._rushConfiguration.commonTempFolder,
        'node_modules');

      // This marker file indicates that the last "rush install" completed successfully
      const markerFileExistedAndWasValidAtStart: boolean = this._commonNodeModulesMarker.isValid();

      // If "--clean" or "--full-clean" was specified, or if the last install was interrupted,
      // then we will need to delete the node_modules folder.  Otherwise, we can do an incremental
      // install.
      const deleteNodeModules: boolean = !markerFileExistedAndWasValidAtStart;

      // Based on timestamps, can we skip this install entirely?
      if (shrinkwrapIsUpToDate && !deleteNodeModules) {
        const potentiallyChangedFiles: string[] = [];

        // Consider the timestamp on the node_modules folder; if someone tampered with it
        // or deleted it entirely, then we can't skip this install
        potentiallyChangedFiles.push(commonNodeModulesFolder);

        // Additionally, if they pulled an updated npm-shrinkwrap.json file from Git,
        // then we can't skip this install
        potentiallyChangedFiles.push(this._rushConfiguration.committedShrinkwrapFilename);

        if (this._rushConfiguration.packageManager === 'pnpm') {
          // If the repo is using pnpmfile.js, consider that also
          const pnpmFileFilename: string = path.join(this._rushConfiguration.commonRushConfigFolder,
            RushConstants.pnpmFileFilename);

          if (fsx.existsSync(pnpmFileFilename)) {
            potentiallyChangedFiles.push(pnpmFileFilename);
          }
        }

        // Also consider timestamps for all the temp tarballs. (createTempModulesAndCheckShrinkwrap() will
        // carefully preserve these timestamps unless something has changed.)
        // Example: "C:\MyRepo\common\temp\projects\my-project-2.tgz"
        potentiallyChangedFiles.push(...this._rushConfiguration.projects.map(x => {
          return this._getTarballFilePath(x);
        }));

        // NOTE: If commonNodeModulesMarkerFilename (or any of the potentiallyChangedFiles) does not
        // exist, then isFileTimestampCurrent() returns false.
        if (Utilities.isFileTimestampCurrent(this._commonNodeModulesMarker.path, potentiallyChangedFiles)) {
          // Nothing to do, because everything is up to date according to time stamps
          return;
        }
      }

      return this._checkIfReleaseIsPublished()
        .catch((error) => {
          // If the user is working in an environment that can't reach the registry,
          // don't bother them with errors.
          return undefined;
        }).then((publishedRelease: boolean | undefined) => {

          if (publishedRelease === false) {
            console.log(colors.yellow('Warning: This release of the Rush tool was unpublished; it may be unstable.'));
          }

          // Since we're going to be tampering with common/node_modules, delete the "rush link" flag file if it exists;
          // this ensures that a full "rush link" is required next time
          Utilities.deleteFile(this._rushConfiguration.rushLinkJsonFilename);

          // Delete the successful install file to indicate the install transaction has started
          this._commonNodeModulesMarker.clear();

          // NOTE: The PNPM store is supposed to be transactionally safe, so we don't delete it automatically.
          // The user must request that via the command line.
          if (deleteNodeModules) {
            if (this._rushConfiguration.packageManager === 'npm') {
              console.log(`Deleting the "npm-cache" folder`);
              // This is faster and more thorough than "npm cache clean"
              this._commonTempFolderRecycler.moveFolder(this._rushConfiguration.npmCacheFolder);

              console.log(`Deleting the "npm-tmp" folder`);
              this._commonTempFolderRecycler.moveFolder(this._rushConfiguration.npmTmpFolder);
            }
          }

          // Example: "C:\MyRepo\common\temp\npm-local\node_modules\.bin\npm"
          const packageManagerFilename: string = this._rushConfiguration.packageManagerToolFilename;

          // Is there an existing "node_modules" folder to consider?
          if (fsx.existsSync(commonNodeModulesFolder)) {
            // Should we delete the entire "node_modules" folder?
            if (deleteNodeModules) {
              // YES: Delete "node_modules"

              // Explain to the user why we are hosing their node_modules folder
              console.log('Deleting files from ' + commonNodeModulesFolder);

              this._commonTempFolderRecycler.moveFolder(commonNodeModulesFolder);

              Utilities.createFolderWithRetry(commonNodeModulesFolder);
            } else {
              // NO: Prepare to do an incremental install in the "node_modules" folder

              // note: it is not necessary to run "prune" with pnpm
              if (this._rushConfiguration.packageManager === 'npm') {
                console.log(`Running "${this._rushConfiguration.packageManager} prune"`
                  + ` in ${this._rushConfiguration.commonTempFolder}`);
                const args: string[] = ['prune'];
                this._pushConfigurationArgs(args);
                Utilities.executeCommandWithRetry(MAX_INSTALL_ATTEMPTS, packageManagerFilename, args,
                  this._rushConfiguration.commonTempFolder);

                // Delete the (installed image of) the temp projects, since "npm install" does not
                // detect changes for "file:./" references.
                // We recognize the temp projects by their names, which always start with "rush-".

                // Example: "C:\MyRepo\common\temp\node_modules\@rush-temp"
                const pathToDeleteWithoutStar: string = path.join(commonNodeModulesFolder,
                  RushConstants.rushTempNpmScope);
                console.log(`Deleting ${pathToDeleteWithoutStar}\\*`);
                // Glob can't handle Windows paths
                const normalizedpathToDeleteWithoutStar: string = Text.replaceAll(pathToDeleteWithoutStar, '\\', '/');

                // Example: "C:/MyRepo/common/temp/node_modules/@rush-temp/*"
                for (const tempModulePath of glob.sync(globEscape(normalizedpathToDeleteWithoutStar) + '/*')) {
                  // We could potentially use AsyncRecycler here, but in practice these folders tend
                  // to be very small
                  Utilities.dangerouslyDeletePath(tempModulePath);
                }
              }
            }
          }

          // Run "npm install" in the common folder

          // NOTE:
          // we do NOT install optional dependencies for Rush, as it seems that optional dependencies do not
          // work properly with shrinkwrap. Consider the "fsevents" package. This is a Mac specific package
          // which is an optional second-order dependency. Optional dependencies work by attempting to install
          // the package, but removes the package if the install failed.
          // This means that someone running generate on a Mac WILL have fsevents included in their shrinkwrap.
          // When someone using Windows attempts to install from the shrinkwrap, the install will fail.
          //
          // If someone generates the shrinkwrap using Windows, then fsevents will NOT be listed in the shrinkwrap.
          // When someone using Mac attempts to install from the shrinkwrap, (as of NPM 4), they will NOT have the
          // optional dependency installed.
          //
          // One possible solution would be to have the shrinkwrap include information about whether the dependency
          // is optional or not, but it does not appear to do so. Also, this would result in strange behavior where
          // people would have different node_modules based on their system.

          const installArgs: string[] = ['install', '--no-optional'];
          this._pushConfigurationArgs(installArgs);

          console.log(os.EOL + colors.bold(`Running "${this._rushConfiguration.packageManager} install" in`
            + ` ${this._rushConfiguration.commonTempFolder}`) + os.EOL);

          Utilities.executeCommandWithRetry(MAX_INSTALL_ATTEMPTS, packageManagerFilename,
            installArgs,
            this._rushConfiguration.commonTempFolder,
            undefined,
            false, () => {
              if (this._rushConfiguration.packageManager === 'pnpm') {
                // If there is a failure in pnpm, it is possible that it left the
                // store in a bad state. Therefore, we should clean out the store
                // before attempting the install again.

                console.log(colors.yellow(`Deleting the "node_modules" folder`));
                this._commonTempFolderRecycler.moveFolder(commonNodeModulesFolder);
                console.log(colors.yellow(`Deleting the "pnpm-store" folder`));
                this._commonTempFolderRecycler.moveFolder(this._rushConfiguration.pnpmStoreFolder);

                Utilities.createFolderWithRetry(commonNodeModulesFolder);
              }
            });

          if (this._rushConfiguration.packageManager === 'npm') {

            console.log(os.EOL + colors.bold('Running "npm shrinkwrap"...'));
            const npmArgs: string[] = ['shrinkwrap'];
            this._pushConfigurationArgs(npmArgs);
            Utilities.executeCommand(this._rushConfiguration.packageManagerToolFilename,
              npmArgs, this._rushConfiguration.commonTempFolder);
            console.log('"npm shrinkwrap" completed' + os.EOL);

            this._fixupNpm5Regression();
          }

          if (allowShrinkwrapUpdates && !shrinkwrapIsUpToDate) {
            // Copy (or delete) common\temp\shrinkwrap.yaml --> common\config\rush\shrinkwrap.yaml
            this._syncFile(this._rushConfiguration.tempShrinkwrapFilename,
              this._rushConfiguration.committedShrinkwrapFilename);
          } else {
            // TODO: Validate whether the package manager updated it in a nontrivial way
          }

          // Finally, create the marker file to indicate a successful install
          this._commonNodeModulesMarker.create();

          console.log('');
        });
    });
  }

  private _checkIfReleaseIsPublished(): Promise<boolean> {
    return Promise.resolve().then(() => {
      const lastCheckFile: string = path.join(this._rushConfiguration.rushUserFolder,
        'rush-' + Rush.version, 'last-check.flag');

      if (fsx.existsSync(lastCheckFile)) {
        let cachedResult: boolean | 'error' | undefined = undefined;
        try {
          // NOTE: mtimeMs is not supported yet in NodeJS 6.x
          const nowMs: number = new Date().getTime();
          const ageMs: number = nowMs - fsx.statSync(lastCheckFile).mtime.getTime();
          const HOUR: number = 60 * 60 * 1000;

          // Is the cache too old?
          if (ageMs < 24 * HOUR) {
            // No, read the cached result
            cachedResult = JsonFile.load(lastCheckFile);
          }
        } catch (e) {
          // Unable to parse file
        }
        if (cachedResult === 'error') {
          return Promise.reject(new Error('Unable to contact server'));
        }
        if (cachedResult === true || cachedResult === false) {
          return cachedResult;
        }
      }

      // Before we start the network operation, record a failed state.  If the process exits for some reason,
      // this will record the error.  It will also update the timestamp to prevent other Rush instances
      // from attempting to update the file.
      fsx.mkdirsSync(path.dirname(lastCheckFile));
      JsonFile.save('error', lastCheckFile);

      // For this check we use the official registry, not the private registry
      return this._queryIfReleaseIsPublished('https://registry.npmjs.org:443')
        .then((publishedRelease: boolean) => {
          // Cache the result
          fsx.mkdirsSync(path.dirname(lastCheckFile));
          JsonFile.save(publishedRelease, lastCheckFile);
          return publishedRelease;
        })
        .catch((error: Error) => {
          fsx.mkdirsSync(path.dirname(lastCheckFile));
          JsonFile.save('error', lastCheckFile);
          return Promise.reject(error);
        });
    });
  }

  private _queryIfReleaseIsPublished(registryUrl: string): Promise<boolean> {
    let queryUrl: string = registryUrl;
    if (queryUrl[-1] !== '/') {
      queryUrl += '/';
    }
    // Note that the "@" symbol does not normally get URL-encoded
    queryUrl += RushConstants.rushPackageName.replace('/', '%2F');

    const userAgent: string = `pnpm/? npm/? node/${process.version} ${os.platform()} ${os.arch()}`;

    const headers: fetch.Headers = new fetch.Headers();
    headers.append('user-agent', userAgent);
    headers.append('accept', 'application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8, */*');

    let agent: http.Agent | undefined = undefined;
    if (process.env.HTTP_PROXY) {
      agent = new HttpsProxyAgent(process.env.HTTP_PROXY);
    }

    return fetch.default(queryUrl, {
        headers: headers,
        agent: agent
      })
      .then((response: fetch.Response) => {
        if (!response.ok) {
          return Promise.reject(new Error('Failed to query'));
        }
        return response
          .json()
          .then((data) => {
            let url: string;
            try {
              if (!data.versions[Rush.version]) {
                // Version was not published
                return false;
              }
              url = data.versions[Rush.version].dist.tarball;
              if (!url) {
                return Promise.reject(new Error(`URL not found`));
              }
            } catch (e) {
              return Promise.reject(new Error('Error parsing response'));
            }

            // Make sure the tarball wasn't deleted from the CDN
            headers.set('accept', '*/*');
            return fetch.default(url, {
                headers: headers,
                agent: agent
              })
              .then<boolean>((response2: fetch.Response) => {
                if (!response2.ok) {
                  if (response2.status === 404) {
                    return false;
                  } else {
                    return Promise.reject(new Error('Failed to fetch'));
                  }
                }
                return true;
              });
          });
      });
  }

  /**
   * Used when invoking the NPM tool.  Appends the common configuration options
   * to the command-line.
   */
  private _pushConfigurationArgs(args: string[]): void {
    if (this._rushConfiguration.packageManager === 'npm') {
      args.push('--cache', this._rushConfiguration.npmCacheFolder);
      args.push('--tmp', this._rushConfiguration.npmTmpFolder);
    } else if (this._rushConfiguration.packageManager === 'pnpm') {
      args.push('--store', this._rushConfiguration.pnpmStoreFolder);

      // we are using the --no-lock flag for now, which unfortunately prints a warning, but should be OK
      // since rush already has its own install lock file which will invalidate the cache for us.
      // we theoretically could use the lock file, but we would need to clean the store if the
      // lockfile existed, otherwise PNPM would hang indefinitely. it is simpler to rely on Rush's
      // last install flag, which encapsulates the entire installation
      args.push('--no-lock');
    }
  }

  /**
   * Copies the file "sourcePath" to "targetPath", overwriting the target file location.
   * If the source file does not exist, then the target file is deleted.
   */
  private _syncFile(sourcePath: string, targetPath: string): void {
    if (fsx.existsSync(sourcePath)) {
      console.log('Updating ' + targetPath);
      fsx.copySync(sourcePath, targetPath);
    } else {
      if (fsx.existsSync(targetPath)) {
        console.log('Deleting ' + targetPath);
        fsx.unlinkSync(targetPath);
      }
    }
  }

  /**
   * Gets the path to the tarball
   * Example: "C:\MyRepo\common\temp\projects\my-project-2.tgz"
   */
  private _getTarballFilePath(project: RushConfigurationProject): string {
    return path.join(
      this._rushConfiguration.commonTempFolder,
      RushConstants.rushTempProjectsFolderName,
      `${project.unscopedTempProjectName}.tgz`);
  }

  /**
   * This is a workaround for a bug introduced in NPM 5 (and still unfixed as of NPM 5.5.1):
   * https://github.com/npm/npm/issues/19006
   *
   * The regression is that "npm install" sets the package.json "version" field for the
   * @rush-temp projects to a value like "file:projects/example.tgz", when it should be "0.0.0".
   * This causes "rush link" to fail later, when read-package-tree tries to parse the bad version.
   * The error looks like this:
   *
   * ERROR: Failed to parse package.json for foo: Invalid version: "file:projects/example.tgz"
   *
   * Our workaround is to rewrite the package.json files for each of the @rush-temp projects
   * in the node_modules folder, after "npm install" completes.
   */
  private _fixupNpm5Regression(): void {
    const pathToDeleteWithoutStar: string = path.join(this._rushConfiguration.commonTempFolder,
      'node_modules', RushConstants.rushTempNpmScope);
    // Glob can't handle Windows paths
    const normalizedpathToDeleteWithoutStar: string = Text.replaceAll(pathToDeleteWithoutStar, '\\', '/');

    let anyChanges: boolean = false;

    // Example: "C:/MyRepo/common/temp/node_modules/@rush-temp/*/package.json"
    for (const packageJsonPath of glob.sync(globEscape(normalizedpathToDeleteWithoutStar) + '/*/package.json')) {
      // Example: "C:/MyRepo/common/temp/node_modules/@rush-temp/example/package.json"
      const packageJsonObject: IRushTempPackageJson = JsonFile.load(packageJsonPath);

      // The temp projects always use "0.0.0" as their version
      packageJsonObject.version = '0.0.0';

      if (JsonFile.save(packageJsonObject, packageJsonPath, { onlyIfChanged: true })) {
        anyChanges = true;
      }
    }

    if (anyChanges) {
      console.log(os.EOL + colors.yellow(Utilities.wrapWords(`Applied workaround for NPM 5 bug`)) + os.EOL);
    }
  }

  /**
   * Checks for temp projects that exist in the shrinkwrap file, but don't exist
   * in rush.json.  This might occur, e.g. if a project was recently deleted or renamed.
   *
   * @returns true if orphans were found, or false if everything is okay
   */
  private _findOrphanedTempProjects(shrinkwrapFile: BaseShrinkwrapFile): boolean {

    // We can recognize temp projects because they are under the "@rush-temp" NPM scope.
    for (const tempProjectName of shrinkwrapFile.getTempProjectNames()) {
      if (!this._rushConfiguration.findProjectByTempName(tempProjectName)) {
        console.log(os.EOL + colors.yellow(Utilities.wrapWords(
          `Your NPM shrinkwrap file references a project "${tempProjectName}" which no longer exists.`))
          + os.EOL);
        return true;  // found one
      }
    }

    return false;  // none found
  }
}
