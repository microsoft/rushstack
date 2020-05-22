// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/* eslint max-lines: off */

import * as colors from 'colors';
import * as fetch from 'node-fetch';
import * as fs from 'fs';
import * as http from 'http';
import HttpsProxyAgent = require('https-proxy-agent');
import * as os from 'os';
import * as path from 'path';
import * as semver from 'semver';
import {
  FileSystem,
  JsonFile,
  JsonObject,
  LockFile,
  MapExtensions,
  PosixModeBits,
} from '@rushstack/node-core-library';

import { AlreadyReportedError } from '../../utilities/AlreadyReportedError';
import { ApprovedPackagesChecker } from '../ApprovedPackagesChecker';
import { AsyncRecycler } from '../../utilities/AsyncRecycler';
import { BaseLinkManager } from './BaseLinkManager';
import { BaseShrinkwrapFile } from '../base/BaseShrinkwrapFile';
import { CommonVersionsConfiguration } from '../../api/CommonVersionsConfiguration';
import { EnvironmentConfiguration } from '../../api/EnvironmentConfiguration';
import { Git } from '../Git';
import { LastInstallFlag } from '../../api/LastInstallFlag';
import { LinkManagerFactory } from '../LinkManagerFactory';
import { PackageJsonDependency } from '../../api/PackageJsonEditor';
import { PackageManagerName } from '../../api/packageManager/PackageManager';
import { PnpmPackageManager } from '../../api/packageManager/PnpmPackageManager';
import { PolicyValidator } from '../policy/PolicyValidator';
import { PurgeManager } from '../PurgeManager';
import { Rush } from '../../api/Rush';
import { RushConfiguration, IConfigurationEnvironment, ICurrentVariantJson } from '../../api/RushConfiguration';
import { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { RushGlobalFolder } from '../../api/RushGlobalFolder';
import { RushConstants } from '../RushConstants';
import { ShrinkwrapFileFactory } from '../ShrinkwrapFileFactory';
import { Utilities } from '../../utilities/Utilities';
import { DependencySpecifier } from '../DependencySpecifier';

// The PosixModeBits are intended to be used with bitwise operations.
/* eslint-disable no-bitwise */

export interface IInstallManagerOptions {
  /**
   * Whether the global "--debug" flag was specified.
   */
  debug: boolean;
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
   * Whether to delete the shrinkwrap file before installation, i.e. so that all dependencies
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

  /**
   * The value of the "--network-concurrency" command-line parameter, which
   * is a diagnostic option used to troubleshoot network failures.
   *
   * Currently only supported for PNPM.
   */
  networkConcurrency: number | undefined;

  /**
   * Whether or not to collect verbose logs from the package manager.
   * If specified when using PNPM, the logs will be in /common/temp/pnpm.log
   */
  collectLogFile: boolean;

  /**
   * The variant to consider when performing installations and validating shrinkwrap updates.
   */
  variant?: string | undefined;

  /**
   * Retry the install the specified number of times
   */
  maxInstallAttempts: number
}

/**
 * This class implements common logic between "rush install" and "rush update".
 */
export abstract class BaseInstallManager {
  private _rushConfiguration: RushConfiguration;
  private _rushGlobalFolder: RushGlobalFolder;
  private _installRecycler: AsyncRecycler;
  private _options: IInstallManagerOptions;
  private _commonTempInstallFlag: LastInstallFlag;

  public constructor (
    rushConfiguration: RushConfiguration,
    rushGlobalFolder: RushGlobalFolder,
    purgeManager: PurgeManager,
    options: IInstallManagerOptions
  ) {
    this._rushConfiguration = rushConfiguration;
    this._rushGlobalFolder = rushGlobalFolder;
    this._installRecycler = purgeManager.commonTempFolderRecycler;
    this._options = options;

    const lastInstallState: JsonObject = {
      node: process.versions.node,
      packageManager: rushConfiguration.packageManager,
      packageManagerVersion: rushConfiguration.packageManagerToolVersion
    }

    if (lastInstallState.packageManager === 'pnpm') {
      lastInstallState.storePath = rushConfiguration.pnpmOptions.pnpmStorePath;
    }

    this._commonTempInstallFlag = new LastInstallFlag(
      this._rushConfiguration.commonTempFolder,
      lastInstallState
    );
  }

  protected get rushConfiguration(): RushConfiguration { return this._rushConfiguration; }

  protected get rushGlobalFolder(): RushGlobalFolder { return this._rushGlobalFolder; }

  protected get installRecycler(): AsyncRecycler { return this._installRecycler; }

  protected get options(): IInstallManagerOptions { return this._options; }

  public async doInstall(): Promise<void> {
    const { shrinkwrapIsUpToDate, variantIsUpToDate } = await this.prepare();

    // This marker file indicates that the last "rush install" completed successfully.
    // If "--purge" was specified, or if the last install was interrupted, then we will need to
    // perform a clean install.  Otherwise, we can do an incremental install.
    const cleanInstall: boolean = !this._commonTempInstallFlag.checkValidAndReportStoreIssues();

    // Allow us to defer the file read until we need it
    const canSkipInstall: () => boolean = () => {
      const outputStats: fs.Stats = FileSystem.getStatistics(this._commonTempInstallFlag.path);
      return this.canSkipInstall(outputStats.mtime);
    }

    if (cleanInstall || !shrinkwrapIsUpToDate || !variantIsUpToDate || !canSkipInstall()) {
      let publishedRelease: boolean | undefined;
      try {
        publishedRelease = await this.checkIfReleaseIsPublished();
      } catch {
        // If the user is working in an environment that can't reach the registry,
        // don't bother them with errors.
      }

      if (publishedRelease === false) {
        console.log(colors.yellow('Warning: This release of the Rush tool was unpublished; it may be unstable.'));
      }

      // Since we're going to be tampering with common/node_modules, delete the "rush link" flag file if it exists;
      // this ensures that a full "rush link" is required next time
      Utilities.deleteFile(this.rushConfiguration.rushLinkJsonFilename);

      // Delete the successful install file to indicate the install transaction has started
      this._commonTempInstallFlag.clear();

      // Perform the actual install
      await this.install(cleanInstall);

      const usePnpmFrozenLockfile: boolean = this._rushConfiguration.packageManager === 'pnpm' &&
        this._rushConfiguration.experimentsConfiguration.configuration.usePnpmFrozenLockfileForRushInstall === true;

      if (this.options.allowShrinkwrapUpdates && (usePnpmFrozenLockfile || !shrinkwrapIsUpToDate)) {
        // Shrinkwrap files may need to be post processed after install, so load and save it
        const tempShrinkwrapFile: BaseShrinkwrapFile | undefined = ShrinkwrapFileFactory.getShrinkwrapFile(
          this.rushConfiguration.packageManager,
          this.rushConfiguration.packageManagerOptions,
          this.rushConfiguration.tempShrinkwrapFilename);
        if (tempShrinkwrapFile) {
          tempShrinkwrapFile.save(this.rushConfiguration.tempShrinkwrapFilename);
        }

        // Copy (or delete) common\temp\pnpm-lock.yaml --> common\config\rush\pnpm-lock.yaml
        Utilities.syncFile(
          this.rushConfiguration.tempShrinkwrapFilename,
          this.rushConfiguration.getCommittedShrinkwrapFilename(this.options.variant)
        );
      } else {
        // TODO: Validate whether the package manager updated it in a nontrivial way
      }

      // Create the marker file to indicate a successful install
      this._commonTempInstallFlag.create();

      console.log('');
    }

    if (!this.options.noLink) {
      await this.link();
    } else {
      console.log(
        os.EOL + colors.yellow('Since "--no-link" was specified, you will need to run "rush link" manually.')
      );
    }
  }

  protected abstract prepareAndCheckShrinkwrap(
    shrinkwrapFile: BaseShrinkwrapFile | undefined
  ): Promise<{ shrinkwrapIsUpToDate: boolean, shrinkwrapWarnings: string[] }>;

  protected abstract canSkipInstall(lastInstallDate: Date): boolean;

  /**
   * Runs "npm/pnpm/yarn install" in the "common/temp" folder.
   */
  protected abstract install(cleanInstall: boolean): Promise<void>;

  protected async prepare(): Promise<{ variantIsUpToDate: boolean, shrinkwrapIsUpToDate: boolean }> {
    // Check the policies
    PolicyValidator.validatePolicy(this.rushConfiguration, this.options);

    // Git hooks are only installed if the repo opts in by including files in /common/git-hooks
    const hookSource: string = path.join(this.rushConfiguration.commonFolder, 'git-hooks');
    const hookDestination: string | undefined = Git.getHooksFolder();

    if (FileSystem.exists(hookSource) && hookDestination) {
      const hookFilenames: string[] = FileSystem.readFolder(hookSource);
      if (hookFilenames.length > 0) {
        console.log(os.EOL + colors.bold('Found files in the "common/git-hooks" folder.'));

        // Clear the currently installed git hooks and install fresh copies
        FileSystem.ensureEmptyFolder(hookDestination);

        // Only copy files that look like Git hook names
        const filteredHookFilenames: string[] = hookFilenames.filter(x => /^[a-z\-]+/.test(x));
        for (const filename of filteredHookFilenames) {
          FileSystem.copyFile({
            sourcePath: path.join(hookSource, filename),
            destinationPath: path.join(hookDestination, filename)
          });
          FileSystem.changePosixModeBits(path.join(hookDestination, filename),
            PosixModeBits.UserRead | PosixModeBits.UserExecute);
        }

        console.log('Successfully installed these Git hook scripts: ' + filteredHookFilenames.join(', ') + os.EOL);
      }
    }

    const approvedPackagesChecker: ApprovedPackagesChecker = new ApprovedPackagesChecker(this.rushConfiguration);
    if (approvedPackagesChecker.approvedPackagesFilesAreOutOfDate) {
      if (this.options.allowShrinkwrapUpdates) {
        approvedPackagesChecker.rewriteConfigFiles();
        console.log(colors.yellow(
          'Approved package files have been updated. These updates should be committed to source control'
        ));
      } else {
        throw new Error(`Approved packages files are out-of date. Run "rush update" to update them.`);
      }
    }

    // Ensure that the package manager is installed
    await this.ensureLocalPackageManager();

    // Write a file indicating which variant is being installed.
    // This will be used by bulk scripts to determine the correct Shrinkwrap file to track.
    const currentVariantJsonFilename: string = this.rushConfiguration.currentVariantJsonFilename;
    const currentVariantJson: ICurrentVariantJson = {
      variant: this.options.variant || null // eslint-disable-line @rushstack/no-null
    };

    // Determine if the variant is already current by updating current-variant.json.
    // If nothing is written, the variant has not changed.
    const variantIsUpToDate: boolean = !JsonFile.save(currentVariantJson, currentVariantJsonFilename, {
      onlyIfChanged: true
    });

    if (this.options.variant) {
      console.log();
      console.log(colors.bold(`Using variant '${this.options.variant}' for installation.`));
    } else if (!variantIsUpToDate && !this.options.variant) {
      console.log();
      console.log(colors.bold('Using the default variant for installation.'));
    }

    let shrinkwrapFile: BaseShrinkwrapFile | undefined = undefined;

    // (If it's a full update, then we ignore the shrinkwrap from Git since it will be overwritten)
    if (!this.options.fullUpgrade) {
      try {
        shrinkwrapFile = ShrinkwrapFileFactory.getShrinkwrapFile(
          this.rushConfiguration.packageManager,
          this.rushConfiguration.packageManagerOptions,
          this.rushConfiguration.getCommittedShrinkwrapFilename(this.options.variant)
        );
      } catch (ex) {
        console.log();
        console.log(`Unable to load the ${this.rushConfiguration.shrinkwrapFilePhrase}: ${ex.message}`);

        if (!this.options.allowShrinkwrapUpdates) {
          console.log();
          console.log(colors.red('You need to run "rush update" to fix this problem'));
          throw new AlreadyReportedError();
        }

        shrinkwrapFile = undefined;
      }
    }

    // Also copy down the committed .npmrc file, if there is one
    // "common\config\rush\.npmrc" --> "common\temp\.npmrc"
    // Also ensure that we remove any old one that may be hanging around
    Utilities.syncNpmrc(this.rushConfiguration.commonRushConfigFolder, this.rushConfiguration.commonTempFolder);

    // also, copy the pnpmfile.js if it exists
    if (this.rushConfiguration.packageManager === 'pnpm') {
      const committedPnpmFilePath: string = this.rushConfiguration.getPnpmfilePath(this.options.variant);
      const tempPnpmFilePath: string = path.join(
        this.rushConfiguration.commonTempFolder,
        RushConstants.pnpmfileFilename
      );

      // ensure that we remove any old one that may be hanging around
      Utilities.syncFile(committedPnpmFilePath, tempPnpmFilePath);
    }

    // Allow for package managers to do their own preparation and check that the shrinkwrap is up to date
    // eslint-disable-next-line prefer-const
    let { shrinkwrapIsUpToDate, shrinkwrapWarnings } = await this.prepareAndCheckShrinkwrap(shrinkwrapFile);
    shrinkwrapIsUpToDate = shrinkwrapIsUpToDate && !(
      this.options.recheckShrinkwrap || (shrinkwrapFile && shrinkwrapFile.shouldForceRecheck())
    );

    // Write out the reported warnings
    if (shrinkwrapWarnings.length > 0) {
      console.log();
      console.log(colors.yellow(Utilities.wrapWords(
        `The ${this.rushConfiguration.shrinkwrapFilePhrase} contains the following issues:`)));

      for (const shrinkwrapWarning of shrinkwrapWarnings) {
        console.log(colors.yellow('  ' + shrinkwrapWarning));
      }
      console.log();
    }

    this._syncTempShrinkwrap(shrinkwrapFile);

    // Force update if the shrinkwrap is out of date
    if (!shrinkwrapIsUpToDate) {
      if (!this.options.allowShrinkwrapUpdates) {
        console.log();
        console.log(colors.red(
          `The ${this.rushConfiguration.shrinkwrapFilePhrase} is out of date. You need to run "rush update".`
        ));
        throw new AlreadyReportedError();
      }
    }

    return { shrinkwrapIsUpToDate, variantIsUpToDate };
  }

  protected link(): Promise<void> {
    const linkManager: BaseLinkManager = LinkManagerFactory.getLinkManager(this.rushConfiguration);
    return linkManager.createSymlinksForProjects(false);
  }

  protected checkIfReleaseIsPublished(): Promise<boolean> {
    return Promise.resolve().then(() => {
      const lastCheckFile: string = path.join(this.rushGlobalFolder.nodeSpecificPath,
        'rush-' + Rush.version, 'last-check.flag');

      if (FileSystem.exists(lastCheckFile)) {
        let cachedResult: boolean | 'error' | undefined = undefined;
        try {
          // NOTE: mtimeMs is not supported yet in Node.js 6.x
          const nowMs: number = new Date().getTime();
          const ageMs: number = nowMs - FileSystem.getStatistics(lastCheckFile).mtime.getTime();
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
      JsonFile.save('error', lastCheckFile, { ensureFolderExists: true });

      // For this check we use the official registry, not the private registry
      return BaseInstallManager._queryIfReleaseIsPublished('https://registry.npmjs.org:443')
        .then((publishedRelease: boolean) => {
          // Cache the result
          JsonFile.save(publishedRelease, lastCheckFile, { ensureFolderExists: true });
          return publishedRelease;
        })
        .catch((error: Error) => {
          JsonFile.save('error', lastCheckFile, { ensureFolderExists: true });
          return Promise.reject(error);
        });
    });
  }

  /**
   * If the "(p)npm-local" symlink hasn't been set up yet, this creates it, installing the
   * specified (P)npm version in the user's home directory if needed.
   */
  public ensureLocalPackageManager(): Promise<void> {
    // Example: "C:\Users\YourName\.rush"
    const rushUserFolder: string = this.rushGlobalFolder.nodeSpecificPath;

    if (!FileSystem.exists(rushUserFolder)) {
      console.log('Creating ' + rushUserFolder);
      FileSystem.ensureFolder(rushUserFolder);
    }

    const packageManager: PackageManagerName = this.rushConfiguration.packageManager;
    const packageManagerVersion: string = this.rushConfiguration.packageManagerToolVersion;

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
          version: this.rushConfiguration.packageManagerToolVersion,
          tempPackageTitle: `${packageManager}-local-install`,
          maxInstallAttempts: this.options.maxInstallAttempts,
          // This is using a local configuration to install a package in a shared global location.
          // Generally that's a bad practice, but in this case if we can successfully install
          // the package at all, we can reasonably assume it's good for all the repositories.
          // In particular, we'll assume that two different NPM registries cannot have two
          // different implementations of the same version of the same package.
          // This was needed for: https://github.com/microsoft/rushstack/issues/691
          commonRushConfigFolder: this.rushConfiguration.commonRushConfigFolder
        });

        console.log(`Successfully installed ${packageManager} version ${packageManagerVersion}`);
      } else {
        console.log(`Found ${packageManager} version ${packageManagerVersion} in ${packageManagerToolFolder}`);
      }

      packageManagerMarker.create();

      // Example: "C:\MyRepo\common\temp"
      FileSystem.ensureFolder(this.rushConfiguration.commonTempFolder);

      // Example: "C:\MyRepo\common\temp\pnpm-local"
      const localPackageManagerToolFolder: string = path.join(
        this.rushConfiguration.commonTempFolder,
        `${packageManager}-local`
      );

      console.log(os.EOL + 'Symlinking "' + localPackageManagerToolFolder + '"');
      console.log('  --> "' + packageManagerToolFolder + '"');

      // We cannot use FileSystem.exists() to test the existence of a symlink, because it will
      // return false for broken symlinks.  There is no way to test without catching an exception.
      try {
        FileSystem.deleteFolder(localPackageManagerToolFolder);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }

      FileSystem.createSymbolicLinkJunction({
        linkTargetPath: packageManagerToolFolder,
        newLinkPath: localPackageManagerToolFolder
      });

      lock.release();
    });
  }

  protected getPackageManagerEnvironment(): NodeJS.ProcessEnv {
    let configurationEnvironment: IConfigurationEnvironment | undefined = undefined;
    if (this.rushConfiguration.packageManager === 'npm') {
      if (
        this.rushConfiguration.npmOptions &&
        this.rushConfiguration.npmOptions.environmentVariables
      ) {
        configurationEnvironment = this.rushConfiguration.npmOptions.environmentVariables;
      }
    } else if (this.rushConfiguration.packageManager === 'pnpm') {
      if (
        this.rushConfiguration.pnpmOptions &&
        this.rushConfiguration.pnpmOptions.environmentVariables
      ) {
        configurationEnvironment = this.rushConfiguration.pnpmOptions.environmentVariables;
      }
    } else if (this.rushConfiguration.packageManager === 'yarn') {
      if (
        this.rushConfiguration.yarnOptions &&
        this.rushConfiguration.yarnOptions.environmentVariables
      ) {
        configurationEnvironment = this.rushConfiguration.yarnOptions.environmentVariables;
      }
    }

    return this._mergeEnvironmentVariables(
      process.env,
      configurationEnvironment
    );
  }

  /**
   * Used when invoking the NPM tool.  Appends the common configuration options
   * to the command-line.
   */
  protected pushConfigurationArgs(args: string[], options: IInstallManagerOptions): void {
    if (this._rushConfiguration.packageManager === 'npm') {
      if (semver.lt(this._rushConfiguration.packageManagerToolVersion, '5.0.0')) {
        // NOTE:
        //
        // When using an npm version older than v5.0.0, we do NOT install optional dependencies for
        // Rush, because npm does not generate the shrinkwrap file consistently across platforms.
        //
        // Consider the "fsevents" package. This is a Mac specific package
        // which is an optional second-order dependency. Optional dependencies work by attempting to install
        // the package, but removes the package if the install failed.
        // This means that someone running generate on a Mac WILL have fsevents included in their shrinkwrap.
        // When someone using Windows attempts to install from the shrinkwrap, the install will fail.
        //
        // If someone generates the shrinkwrap using Windows, then fsevents will NOT be listed in the shrinkwrap.
        // When someone using Mac attempts to install from the shrinkwrap, they will NOT have the
        // optional dependency installed.
        //
        // This issue has been fixed as of npm v5.0.0: https://github.com/npm/npm/releases/tag/v5.0.0
        //
        // For more context, see https://github.com/microsoft/rushstack/issues/761#issuecomment-428689600
        args.push('--no-optional');
      }
      args.push('--cache', this._rushConfiguration.npmCacheFolder);
      args.push('--tmp', this._rushConfiguration.npmTmpFolder);

      if (options.collectLogFile) {
        args.push('--verbose');
      }
    } else if (this._rushConfiguration.packageManager === 'pnpm') {
      // Only explicitly define the store path if `pnpmStore` is using the default, or has been set to
      // 'local'.  If `pnpmStore` = 'global', then allow PNPM to use the system's default
      // path.  In all cases, this will be overridden by RUSH_PNPM_STORE_PATH
      if (
        this._rushConfiguration.pnpmOptions.pnpmStore === 'local' ||
        EnvironmentConfiguration.pnpmStorePathOverride
      ) {
        args.push('--store', this._rushConfiguration.pnpmOptions.pnpmStorePath);
      }

      // we are using the --no-lock flag for now, which unfortunately prints a warning, but should be OK
      // since rush already has its own install lock file which will invalidate the cache for us.
      // we theoretically could use the lock file, but we would need to clean the store if the
      // lockfile existed, otherwise PNPM would hang indefinitely. it is simpler to rely on Rush's
      // last install flag, which encapsulates the entire installation
      args.push('--no-lock');

      // Ensure that Rush's tarball dependencies get synchronized properly with the pnpm-lock.yaml file.
      // See this GitHub issue: https://github.com/pnpm/pnpm/issues/1342

      if (this.rushConfiguration.experimentsConfiguration.configuration.usePnpmFrozenLockfileForRushInstall) {
        if (!this.options.allowShrinkwrapUpdates) {
          if (semver.gte(this._rushConfiguration.packageManagerToolVersion, '3.0.0')) {
            args.push('--frozen-lockfile');
          } else {
            args.push('--frozen-shrinkwrap');
          }
        } else {
          // Ensure that Rush's tarball dependencies get synchronized properly with the pnpm-lock.yaml file.
          // See this GitHub issue: https://github.com/pnpm/pnpm/issues/1342
          if (semver.gte(this._rushConfiguration.packageManagerToolVersion, '3.0.0')) {
            args.push('--no-prefer-frozen-lockfile');
          } else {
            args.push('--no-prefer-frozen-shrinkwrap');
          }
        }
      } else {
        // Ensure that Rush's tarball dependencies get synchronized properly with the pnpm-lock.yaml file.
        // See this GitHub issue: https://github.com/pnpm/pnpm/issues/1342
        if (semver.gte(this._rushConfiguration.packageManagerToolVersion, '3.0.0')) {
          args.push('--no-prefer-frozen-lockfile');
        } else {
          args.push('--no-prefer-frozen-shrinkwrap');
        }
      }

      if (options.collectLogFile) {
        args.push('--reporter', 'ndjson');
      }

      if (options.networkConcurrency) {
        args.push('--network-concurrency', options.networkConcurrency.toString());
      }

      if (this._rushConfiguration.pnpmOptions.strictPeerDependencies) {
        args.push('--strict-peer-dependencies');
      }

      if ((this._rushConfiguration.packageManagerWrapper as PnpmPackageManager).supportsResolutionStrategy) {
        args.push('--resolution-strategy', this._rushConfiguration.pnpmOptions.resolutionStrategy);
      }
    } else if (this._rushConfiguration.packageManager === 'yarn') {
      args.push('--link-folder', 'yarn-link');
      args.push('--cache-folder', this._rushConfiguration.yarnCacheFolder);

      // Without this option, Yarn will sometimes stop and ask for user input on STDIN
      // (e.g. "Which command would you like to run?").
      args.push('--non-interactive');

      if (options.networkConcurrency) {
        args.push('--network-concurrency', options.networkConcurrency.toString());
      }

      if (this._rushConfiguration.yarnOptions.ignoreEngines) {
        args.push('--ignore-engines');
      }
    }
  }

  private _syncTempShrinkwrap(shrinkwrapFile: BaseShrinkwrapFile | undefined): void {
    if (shrinkwrapFile) {
      // If we have a (possibly incomplete) shrinkwrap file, save it as the temporary file.
      shrinkwrapFile.save(this.rushConfiguration.tempShrinkwrapFilename);
      shrinkwrapFile.save(this.rushConfiguration.tempShrinkwrapPreinstallFilename);
    } else {
      // Otherwise delete the temporary file
      FileSystem.deleteFile(this.rushConfiguration.tempShrinkwrapFilename);

      if (this.rushConfiguration.packageManager === 'pnpm') {
        // Workaround for https://github.com/pnpm/pnpm/issues/1890
        //
        // When "rush update --full" is run, rush deletes common/temp/pnpm-lock.yaml so that
        // a new lockfile can be generated. But because of the above bug "pnpm install" would
        // respect "common/temp/node_modules/.pnpm-lock.yaml" and thus would not generate a
        // new lockfile. Deleting this file in addition to deleting common/temp/pnpm-lock.yaml
        // ensures that a new lockfile will be generated with "rush update --full".

        const pnpmPackageManager: PnpmPackageManager =
          (this.rushConfiguration.packageManagerWrapper as PnpmPackageManager);

        FileSystem.deleteFile(path.join(this.rushConfiguration.commonTempFolder,
          pnpmPackageManager.internalShrinkwrapRelativePath));
      }
    }
  }

  private _mergeEnvironmentVariables(
    baseEnv: NodeJS.ProcessEnv,
    environmentVariables?: IConfigurationEnvironment
  ): NodeJS.ProcessEnv {
    const packageManagerEnv: NodeJS.ProcessEnv = baseEnv;

    if (environmentVariables) {
      // eslint-disable-next-line guard-for-in
      for (const envVar in environmentVariables) {
        let setEnvironmentVariable: boolean = true;
        console.log(`\nProcessing definition for environment variable: ${envVar}`);

        if (baseEnv.hasOwnProperty(envVar)) {
          setEnvironmentVariable = false;
          console.log(`Environment variable already defined:`);
          console.log(`  Name: ${envVar}`);
          console.log(`  Existing value: ${baseEnv[envVar]}`);
          console.log(`  Value set in rush.json: ${environmentVariables[envVar].value}`);

          if (environmentVariables[envVar].override) {
            setEnvironmentVariable = true;
            console.log(`Overriding the environment variable with the value set in rush.json.`);
          }
          else {
            console.log(colors.yellow(`WARNING: Not overriding the value of the environment variable.`));
          }
        }

        if (setEnvironmentVariable) {
          if (this.options.debug) {
            console.log(`Setting environment variable for package manager.`);
            console.log(`  Name: ${envVar}`);
            console.log(`  Value: ${environmentVariables[envVar].value}`);
          }
          packageManagerEnv[envVar] = environmentVariables[envVar].value;
        }
      }
    }

    return packageManagerEnv;
  }

  public static collectPreferredVersions(
    rushConfiguration: RushConfiguration,
    variant: string | undefined
  ): Map<string, string> {
    // dependency name --> version specifier
    const allExplicitPreferredVersions: Map<string, string> = rushConfiguration
      .getCommonVersions(variant)
      .getAllPreferredVersions();

    // dependency name --> version specifier
    const allPreferredVersions: Map<string, string> = new Map<string, string>();

    // Should we add implicitly preferred versions?
    let useImplicitlyPinnedVersions: boolean;
    if (rushConfiguration.commonVersions.implicitlyPreferredVersions !== undefined) {
      // Use the manually configured setting
      useImplicitlyPinnedVersions = rushConfiguration.commonVersions.implicitlyPreferredVersions;
    } else {
      // Default to true.
      useImplicitlyPinnedVersions = true;
    }

    if (useImplicitlyPinnedVersions) {
      // Add in the implicitly preferred versions.
      // These are any first-level dependencies for which we only consume a single version range
      // (e.g. every package that depends on react uses an identical specifier)
      const implicitlyPreferredVersions: Map<string, string> =
        BaseInstallManager.collectImplicitlyPreferredVersions(rushConfiguration, { variant });
      MapExtensions.mergeFromMap(allPreferredVersions, implicitlyPreferredVersions);
    }

    // Add in the explicitly preferred versions.
    // Note that these take precedence over implicitly preferred versions.
    MapExtensions.mergeFromMap(allPreferredVersions, allExplicitPreferredVersions);
    return allPreferredVersions;
  }

  /**
   * Returns a map of all direct dependencies that only have a single semantic version specifier.
   * Returns a map: dependency name --> version specifier
   */
  public static collectImplicitlyPreferredVersions(
    rushConfiguration: RushConfiguration,
    options: {
      variant?: string | undefined
    } = {}
  ): Map<string, string> {
    // First, collect all the direct dependencies of all local projects, and their versions:
    // direct dependency name --> set of version specifiers
    const versionsForDependencies: Map<string, Set<string>> = new Map<string, Set<string>>();

    rushConfiguration.projects.forEach((project: RushConfigurationProject) => {
      BaseInstallManager._collectVersionsForDependencies(
        rushConfiguration,
        {
          versionsForDependencies,
          dependencies: project.packageJsonEditor.dependencyList,
          cyclicDependencies: project.cyclicDependencyProjects,
          variant: options.variant
        });

      BaseInstallManager._collectVersionsForDependencies(
        rushConfiguration,
        {
          versionsForDependencies,
          dependencies: project.packageJsonEditor.devDependencyList,
          cyclicDependencies: project.cyclicDependencyProjects,
          variant: options.variant
        });
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

  // Helper for checkIfReleaseIsPublished()
  private static _queryIfReleaseIsPublished(registryUrl: string): Promise<boolean> {
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

  // Helper for collectImplicitlyPreferredVersions()
  private static _updateVersionsForDependencies(versionsForDependencies: Map<string, Set<string>>,
    dependency: string, version: string): void {
    if (!versionsForDependencies.has(dependency)) {
      versionsForDependencies.set(dependency, new Set<string>());
    }
    versionsForDependencies.get(dependency)!.add(version);
  }

  // Helper for collectImplicitlyPreferredVersions()
  private static _collectVersionsForDependencies(
    rushConfiguration: RushConfiguration,
    options: {
      versionsForDependencies: Map<string, Set<string>>;
      dependencies: ReadonlyArray<PackageJsonDependency>;
      cyclicDependencies: Set<string>;
      variant: string | undefined;
    }): void {
    const {
      variant,
      dependencies,
      versionsForDependencies,
      cyclicDependencies
    } = options;

    const commonVersions: CommonVersionsConfiguration = rushConfiguration.getCommonVersions(variant);

    const allowedAlternativeVersions: Map<string, ReadonlyArray<string>>
      = commonVersions.allowedAlternativeVersions;

    for (const dependency of dependencies) {
      const alternativesForThisDependency: ReadonlyArray<string>
        = allowedAlternativeVersions.get(dependency.name) || [];

      // For each dependency, collectImplicitlyPreferredVersions() is collecting the set of all version specifiers
      // that appear across the repo.  If there is only one version specifier, then that's the "preferred" one.
      // However, there are a few cases where additional version specifiers can be safely ignored.
      let ignoreVersion: boolean = false;

      // 1. If the version specifier was listed in "allowedAlternativeVersions", then it's never a candidate.
      //    (Even if it's the only version specifier anywhere in the repo, we still ignore it, because
      //    otherwise the rule would be difficult to explain.)
      if (alternativesForThisDependency.indexOf(dependency.version) > 0) {
        ignoreVersion = true;
      } else {
        // Is it a local project?
        const localProject: RushConfigurationProject | undefined = rushConfiguration.getProjectByName(dependency.name);
        if (localProject) {
          // 2. If it's a symlinked local project, then it's not a candidate, because the package manager will
          //    never even see it.
          // However there are two ways that a local project can NOT be symlinked:
          // - if the local project doesn't satisfy the referenced semver specifier; OR
          // - if the local project was specified in "cyclicDependencyProjects" in rush.json
          const specifier: DependencySpecifier = new DependencySpecifier(dependency.name, dependency.version);
          if (semver.satisfies(localProject.packageJsonEditor.version, specifier.versionSpecifier)
            && !cyclicDependencies.has(dependency.name)) {
            ignoreVersion = true;
          }
        }

        if (!ignoreVersion) {
          BaseInstallManager._updateVersionsForDependencies(versionsForDependencies, dependency.name, dependency.version);
        }
      }
    }
  }
}
