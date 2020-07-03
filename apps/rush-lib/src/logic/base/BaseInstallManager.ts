// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';
import * as fetch from 'node-fetch';
import * as fs from 'fs';
import * as http from 'http';
import HttpsProxyAgent = require('https-proxy-agent');
import * as os from 'os';
import * as path from 'path';
import * as semver from 'semver';
import { FileSystem, JsonFile, JsonObject, PosixModeBits, NewlineKind } from '@rushstack/node-core-library';

import { AlreadyReportedError } from '../../utilities/AlreadyReportedError';
import { ApprovedPackagesChecker } from '../ApprovedPackagesChecker';
import { AsyncRecycler } from '../../utilities/AsyncRecycler';
import { BaseLinkManager } from './BaseLinkManager';
import { BaseShrinkwrapFile } from '../base/BaseShrinkwrapFile';
import { EnvironmentConfiguration } from '../../api/EnvironmentConfiguration';
import { Git } from '../Git';
import { LastInstallFlag } from '../../api/LastInstallFlag';
import { PnpmPackageManager } from '../../api/packageManager/PnpmPackageManager';
import { PurgeManager } from '../PurgeManager';
import { RushConfiguration, ICurrentVariantJson } from '../../api/RushConfiguration';
import { Rush } from '../../api/Rush';
import { RushGlobalFolder } from '../../api/RushGlobalFolder';
import { RushConstants } from '../RushConstants';
import { ShrinkwrapFileFactory } from '../ShrinkwrapFileFactory';
import { Utilities } from '../../utilities/Utilities';
import { InstallHelpers } from '../installManager/InstallHelpers';
import { PolicyValidator } from '../policy/PolicyValidator';
import { LinkManagerFactory } from '../LinkManagerFactory';

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
  maxInstallAttempts: number;

  /**
   * The list of projects that should be installed, along with project dependencies.
   */
  toFlags: ReadonlyArray<string>;
}

/**
 * This class implements common logic between "rush install" and "rush update".
 */
export abstract class BaseInstallManager {
  private _rushConfiguration: RushConfiguration;
  private _rushGlobalFolder: RushGlobalFolder;
  private _commonTempInstallFlag: LastInstallFlag;
  private _installRecycler: AsyncRecycler;

  private _options: IInstallManagerOptions;

  public constructor(
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
    };

    if (lastInstallState.packageManager === 'pnpm' && rushConfiguration.pnpmOptions) {
      lastInstallState.storePath = rushConfiguration.pnpmOptions.pnpmStorePath;
      if (rushConfiguration.pnpmOptions.useWorkspaces) {
        lastInstallState.workspaces = rushConfiguration.pnpmOptions.useWorkspaces;
      }
    }

    this._commonTempInstallFlag = new LastInstallFlag(
      this._rushConfiguration.commonTempFolder,
      lastInstallState
    );
  }

  protected get rushConfiguration(): RushConfiguration {
    return this._rushConfiguration;
  }

  protected get rushGlobalFolder(): RushGlobalFolder {
    return this._rushGlobalFolder;
  }

  protected get installRecycler(): AsyncRecycler {
    return this._installRecycler;
  }

  protected get options(): IInstallManagerOptions {
    return this._options;
  }

  public async doInstall(): Promise<void> {
    const isFilteredInstall: boolean = this.options.toFlags.length > 0;

    // Prevent filtered installs when workspaces is disabled
    if (
      isFilteredInstall &&
      !(this.rushConfiguration.pnpmOptions && this.rushConfiguration.pnpmOptions.useWorkspaces)
    ) {
      console.log();
      console.log(
        colors.red(
          'The "--to" argument can only be used when running in a workspace environment. Run the ' +
            'command again without specifying this argument.'
        )
      );
      throw new AlreadyReportedError();
    }

    // Prevent update when using a filter, as modifications to the shrinkwrap shouldn't be saved
    if (this.options.allowShrinkwrapUpdates && isFilteredInstall) {
      console.log();
      console.log(
        colors.red(
          'The "--to" argument cannot be used when running "rush update". Run the command again ' +
            'without specifying this argument.'
        )
      );
      throw new AlreadyReportedError();
    }

    const { shrinkwrapIsUpToDate, variantIsUpToDate } = await this.prepareAsync();

    // This marker file indicates that the last "rush install" completed successfully.
    // Always perform a clean install if filter flags were provided. Additionally, if
    // "--purge" was specified, or if the last install was interrupted, then we will
    // need to perform a clean install.  Otherwise, we can do an incremental install.
    const cleanInstall: boolean =
      isFilteredInstall || !this._commonTempInstallFlag.checkValidAndReportStoreIssues();

    // Allow us to defer the file read until we need it
    const canSkipInstall: () => boolean = () => {
      // Based on timestamps, can we skip this install entirely?
      const outputStats: fs.Stats = FileSystem.getStatistics(this._commonTempInstallFlag.path);
      return this.canSkipInstall(outputStats.mtime);
    };

    if (cleanInstall || !shrinkwrapIsUpToDate || !variantIsUpToDate || !canSkipInstall()) {
      let publishedRelease: boolean | undefined;
      try {
        publishedRelease = await this._checkIfReleaseIsPublished();
      } catch {
        // If the user is working in an environment that can't reach the registry,
        // don't bother them with errors.
      }

      if (publishedRelease === false) {
        console.log(
          colors.yellow('Warning: This release of the Rush tool was unpublished; it may be unstable.')
        );
      }

      // Since we're going to be tampering with common/node_modules, delete the "rush link" flag file if it exists;
      // this ensures that a full "rush link" is required next time
      Utilities.deleteFile(this.rushConfiguration.rushLinkJsonFilename);

      // Delete the successful install file to indicate the install transaction has started
      this._commonTempInstallFlag.clear();

      // Perform the actual install
      await this.installAsync(cleanInstall);

      const usePnpmFrozenLockfile: boolean =
        this._rushConfiguration.packageManager === 'pnpm' &&
        this._rushConfiguration.experimentsConfiguration.configuration.usePnpmFrozenLockfileForRushInstall ===
          true;

      if (this.options.allowShrinkwrapUpdates && (usePnpmFrozenLockfile || !shrinkwrapIsUpToDate)) {
        // Copy (or delete) common\temp\pnpm-lock.yaml --> common\config\rush\pnpm-lock.yaml
        Utilities.syncFile(
          this._rushConfiguration.tempShrinkwrapFilename,
          this._rushConfiguration.getCommittedShrinkwrapFilename(this.options.variant)
        );
      } else {
        // TODO: Validate whether the package manager updated it in a nontrivial way
      }

      // Always update the state file if running "rush update"
      if (this.options.allowShrinkwrapUpdates) {
        if (this.rushConfiguration.getRepoState(this.options.variant).refreshState(this.rushConfiguration)) {
          console.log(
            colors.yellow(
              `${RushConstants.repoStateFilename} has been modified and must be committed to source control.`
            )
          );
        }
      }

      // Create the marker file to indicate a successful install if it's not a filtered install
      if (!isFilteredInstall) {
        this._commonTempInstallFlag.create();
      }

      console.log('');
    }

    if (!this.options.noLink) {
      const linkManager: BaseLinkManager = LinkManagerFactory.getLinkManager(this._rushConfiguration);
      await linkManager.createSymlinksForProjects(false);
    } else {
      console.log(
        os.EOL + colors.yellow('Since "--no-link" was specified, you will need to run "rush link" manually.')
      );
    }
  }

  protected abstract prepareCommonTempAsync(
    shrinkwrapFile: BaseShrinkwrapFile | undefined
  ): Promise<{ shrinkwrapIsUpToDate: boolean; shrinkwrapWarnings: string[] }>;

  protected abstract canSkipInstall(lastInstallDate: Date): boolean;

  protected abstract installAsync(cleanInstall: boolean): Promise<void>;

  protected async prepareAsync(): Promise<{ variantIsUpToDate: boolean; shrinkwrapIsUpToDate: boolean }> {
    // Check the policies
    PolicyValidator.validatePolicy(this._rushConfiguration, this.options);

    // Git hooks are only installed if the repo opts in by including files in /common/git-hooks
    const hookSource: string = path.join(this._rushConfiguration.commonFolder, 'git-hooks');
    const hookDestination: string | undefined = Git.getHooksFolder();

    if (FileSystem.exists(hookSource) && hookDestination) {
      const allHookFilenames: string[] = FileSystem.readFolder(hookSource);
      // Ignore the ".sample" file(s) in this folder.
      const hookFilenames: string[] = allHookFilenames.filter((x) => !/\.sample$/.test(x));
      if (hookFilenames.length > 0) {
        console.log(os.EOL + colors.bold('Found files in the "common/git-hooks" folder.'));

        // Clear the currently installed git hooks and install fresh copies
        FileSystem.ensureEmptyFolder(hookDestination);

        // Only copy files that look like Git hook names
        const filteredHookFilenames: string[] = hookFilenames.filter((x) => /^[a-z\-]+/.test(x));
        for (const filename of filteredHookFilenames) {
          // Copy the file.  Important: For Bash scripts, the EOL must not be CRLF.
          const hookFileContent: string = FileSystem.readFile(path.join(hookSource, filename));
          FileSystem.writeFile(path.join(hookDestination, filename), hookFileContent, {
            convertLineEndings: NewlineKind.Lf
          });

          FileSystem.changePosixModeBits(
            path.join(hookDestination, filename),
            // eslint-disable-next-line no-bitwise
            PosixModeBits.UserRead | PosixModeBits.UserExecute
          );
        }

        console.log(
          'Successfully installed these Git hook scripts: ' + filteredHookFilenames.join(', ') + os.EOL
        );
      }
    }

    const approvedPackagesChecker: ApprovedPackagesChecker = new ApprovedPackagesChecker(
      this._rushConfiguration
    );
    if (approvedPackagesChecker.approvedPackagesFilesAreOutOfDate) {
      if (this._options.allowShrinkwrapUpdates) {
        approvedPackagesChecker.rewriteConfigFiles();
        console.log(
          colors.yellow(
            'Approved package files have been updated. These updates should be committed to source control'
          )
        );
      } else {
        throw new Error(`Approved packages files are out-of date. Run "rush update" to update them.`);
      }
    }

    // Ensure that the package manager is installed
    await InstallHelpers.ensureLocalPackageManager(
      this._rushConfiguration,
      this._rushGlobalFolder,
      this._options.maxInstallAttempts
    );

    let shrinkwrapFile: BaseShrinkwrapFile | undefined = undefined;

    // (If it's a full update, then we ignore the shrinkwrap from Git since it will be overwritten)
    if (!this.options.fullUpgrade) {
      try {
        shrinkwrapFile = ShrinkwrapFileFactory.getShrinkwrapFile(
          this._rushConfiguration.packageManager,
          this._rushConfiguration.packageManagerOptions,
          this._rushConfiguration.getCommittedShrinkwrapFilename(this.options.variant)
        );
      } catch (ex) {
        console.log();
        console.log(`Unable to load the ${this._rushConfiguration.shrinkwrapFilePhrase}: ${ex.message}`);

        if (!this.options.allowShrinkwrapUpdates) {
          console.log();
          console.log(colors.red('You need to run "rush update" to fix this problem'));
          throw new AlreadyReportedError();
        }

        shrinkwrapFile = undefined;
      }
    }

    // Write a file indicating which variant is being installed.
    // This will be used by bulk scripts to determine the correct Shrinkwrap file to track.
    const currentVariantJsonFilename: string = this._rushConfiguration.currentVariantJsonFilename;
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

    // Also copy down the committed .npmrc file, if there is one
    // "common\config\rush\.npmrc" --> "common\temp\.npmrc"
    // Also ensure that we remove any old one that may be hanging around
    Utilities.syncNpmrc(
      this._rushConfiguration.commonRushConfigFolder,
      this._rushConfiguration.commonTempFolder
    );

    // also, copy the pnpmfile.js if it exists
    if (this._rushConfiguration.packageManager === 'pnpm') {
      const committedPnpmFilePath: string = this._rushConfiguration.getPnpmfilePath(this._options.variant);
      const tempPnpmFilePath: string = path.join(
        this._rushConfiguration.commonTempFolder,
        RushConstants.pnpmfileFilename
      );

      // ensure that we remove any old one that may be hanging around
      Utilities.syncFile(committedPnpmFilePath, tempPnpmFilePath);
    }

    // Allow for package managers to do their own preparation and check that the shrinkwrap is up to date
    // eslint-disable-next-line prefer-const
    let { shrinkwrapIsUpToDate, shrinkwrapWarnings } = await this.prepareCommonTempAsync(shrinkwrapFile);
    shrinkwrapIsUpToDate = shrinkwrapIsUpToDate && !this.options.recheckShrinkwrap;

    // Write out the reported warnings
    if (shrinkwrapWarnings.length > 0) {
      console.log();
      console.log(
        colors.yellow(
          Utilities.wrapWords(
            `The ${this.rushConfiguration.shrinkwrapFilePhrase} contains the following issues:`
          )
        )
      );

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
        console.log(
          colors.red(
            `The ${this.rushConfiguration.shrinkwrapFilePhrase} is out of date. You need to run "rush update".`
          )
        );
        throw new AlreadyReportedError();
      }
    }

    return { shrinkwrapIsUpToDate, variantIsUpToDate };
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

      if (
        this._rushConfiguration.experimentsConfiguration.configuration.usePnpmFrozenLockfileForRushInstall &&
        !this._options.allowShrinkwrapUpdates
      ) {
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
        args.push(`--resolution-strategy=${this._rushConfiguration.pnpmOptions.resolutionStrategy}`);
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

  private _checkIfReleaseIsPublished(): Promise<boolean> {
    return Promise.resolve().then(() => {
      const lastCheckFile: string = path.join(
        this._rushGlobalFolder.nodeSpecificPath,
        'rush-' + Rush.version,
        'last-check.flag'
      );

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
      return this._queryIfReleaseIsPublished('https://registry.npmjs.org:443')
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

  // Helper for checkIfReleaseIsPublished()
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

    return fetch
      .default(queryUrl, {
        headers: headers,
        agent: agent
      })
      .then((response: fetch.Response) => {
        if (!response.ok) {
          return Promise.reject(new Error('Failed to query'));
        }
        return response.json().then((data) => {
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
          return fetch
            .default(url, {
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

        const pnpmPackageManager: PnpmPackageManager = this.rushConfiguration
          .packageManagerWrapper as PnpmPackageManager;

        FileSystem.deleteFile(
          path.join(
            this.rushConfiguration.commonTempFolder,
            pnpmPackageManager.internalShrinkwrapRelativePath
          )
        );
      }
    }
  }
}
