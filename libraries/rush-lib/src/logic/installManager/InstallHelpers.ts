// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as semver from 'semver';

import {
  FileConstants,
  FileSystem,
  type IPackageJson,
  JsonFile,
  LockFile
} from '@rushstack/node-core-library';
import { Colorize, type ITerminal } from '@rushstack/terminal';

import { LastInstallFlag } from '../../api/LastInstallFlag';
import type { PackageManagerName } from '../../api/packageManager/PackageManager';
import type { RushConfiguration } from '../../api/RushConfiguration';
import type { RushGlobalFolder } from '../../api/RushGlobalFolder';
import { Utilities } from '../../utilities/Utilities';
import type { IConfigurationEnvironment } from '../base/BasePackageManagerOptionsConfiguration';
import type { PnpmOptionsConfiguration } from '../pnpm/PnpmOptionsConfiguration';
import { merge } from '../../utilities/objectUtilities';
import type { Subspace } from '../../api/Subspace';
import { RushConstants } from '../RushConstants';

interface ICommonPackageJsonPnpmSection {
  overrides?: typeof PnpmOptionsConfiguration.prototype.globalOverrides;
  packageExtensions?: typeof PnpmOptionsConfiguration.prototype.globalPackageExtensions;
  peerDependencyRules?: typeof PnpmOptionsConfiguration.prototype.globalPeerDependencyRules;
  neverBuiltDependencies?: typeof PnpmOptionsConfiguration.prototype.globalNeverBuiltDependencies;
  onlyBuiltDependencies?: typeof PnpmOptionsConfiguration.prototype.globalOnlyBuiltDependencies;
  ignoredOptionalDependencies?: typeof PnpmOptionsConfiguration.prototype.globalIgnoredOptionalDependencies;
  allowedDeprecatedVersions?: typeof PnpmOptionsConfiguration.prototype.globalAllowedDeprecatedVersions;
  patchedDependencies?: typeof PnpmOptionsConfiguration.prototype.globalPatchedDependencies;
  trustPolicy?: typeof PnpmOptionsConfiguration.prototype.trustPolicy;
  trustPolicyExclude?: typeof PnpmOptionsConfiguration.prototype.trustPolicyExclude;
  trustPolicyIgnoreAfter?: typeof PnpmOptionsConfiguration.prototype.trustPolicyIgnoreAfterMinutes;
}

interface ICommonPackageJson extends IPackageJson {
  pnpm?: ICommonPackageJsonPnpmSection;
}

export class InstallHelpers {
  public static async generateCommonPackageJsonAsync(
    rushConfiguration: RushConfiguration,
    subspace: Subspace,
    dependenciesMap: Map<string, string> = new Map<string, string>(),
    terminal: ITerminal
  ): Promise<void> {
    let pnpmSection: ICommonPackageJsonPnpmSection | undefined;
    let additionalCommonPackageJsonPropertiesToMerge: unknown | undefined;
    if (rushConfiguration.isPnpm) {
      const {
        globalOverrides: overrides,
        globalPackageExtensions: packageExtensions,
        globalPeerDependencyRules: peerDependencyRules,
        globalNeverBuiltDependencies,
        globalOnlyBuiltDependencies,
        globalIgnoredOptionalDependencies: ignoredOptionalDependencies,
        globalAllowedDeprecatedVersions: allowedDeprecatedVersions,
        globalPatchedDependencies: patchedDependencies,
        trustPolicy,
        trustPolicyExclude,
        // NOTE: the pnpm setting is `trustPolicyIgnoreAfter`, but the rush pnpm setting is `trustPolicyIgnoreAfterMinutes`
        trustPolicyIgnoreAfterMinutes: trustPolicyIgnoreAfter,
        unsupportedPackageJsonSettings
      } = subspace.getPnpmOptions() || rushConfiguration.pnpmOptions;

      const pnpmVersion: string = rushConfiguration.packageManagerToolVersion;
      const isPnpm11: boolean = semver.gte(pnpmVersion, '11.0.0');

      let neverBuiltDependencies: ICommonPackageJsonPnpmSection['neverBuiltDependencies'];
      if (globalNeverBuiltDependencies) {
        if (isPnpm11) {
          terminal.writeWarningLine(
            Colorize.yellow(
              `Your version of PNPM (${pnpmVersion}) ` +
                `no longer supports the "globalNeverBuiltDependencies" field in ` +
                `${rushConfiguration.commonRushConfigFolder}/${RushConstants.pnpmConfigFilename}. ` +
                'Use "globalAllowBuilds" instead (with a value of false to deny build scripts).'
            )
          );
        } else {
          neverBuiltDependencies = globalNeverBuiltDependencies;
        }
      }

      let onlyBuiltDependencies: ICommonPackageJsonPnpmSection['onlyBuiltDependencies'];
      if (globalOnlyBuiltDependencies) {
        if (isPnpm11) {
          terminal.writeWarningLine(
            Colorize.yellow(
              `Your version of PNPM (${pnpmVersion}) ` +
                `no longer supports the "globalOnlyBuiltDependencies" field in ` +
                `${rushConfiguration.commonRushConfigFolder}/${RushConstants.pnpmConfigFilename}. ` +
                'Use "globalAllowBuilds" instead (with a value of true to allow build scripts).'
            )
          );
        } else {
          if (semver.lt(pnpmVersion, '10.1.0')) {
            terminal.writeWarningLine(
              Colorize.yellow(
                `Your version of PNPM (${pnpmVersion}) ` +
                  `doesn't support the "globalOnlyBuiltDependencies" field in ` +
                  `${rushConfiguration.commonRushConfigFolder}/${RushConstants.pnpmConfigFilename}. ` +
                  'Remove this field or upgrade to PNPM 10.1.0 or newer.'
              )
            );
          }

          onlyBuiltDependencies = globalOnlyBuiltDependencies;
        }
      }

      if (ignoredOptionalDependencies && semver.lt(pnpmVersion, '9.0.0')) {
        terminal.writeWarningLine(
          Colorize.yellow(
            `Your version of PNPM (${pnpmVersion}) ` +
              `doesn't support the "globalIgnoredOptionalDependencies" field in ` +
              `${rushConfiguration.commonRushConfigFolder}/${RushConstants.pnpmConfigFilename}. ` +
              'Remove this field or upgrade to PNPM 9.'
          )
        );
      }

      if (trustPolicy !== undefined && semver.lt(pnpmVersion, '10.21.0')) {
        terminal.writeWarningLine(
          Colorize.yellow(
            `Your version of PNPM (${pnpmVersion}) ` +
              `doesn't support the "trustPolicy" field in ` +
              `${rushConfiguration.commonRushConfigFolder}/${RushConstants.pnpmConfigFilename}. ` +
              'Remove this field or upgrade to PNPM 10.21.0 or newer.'
          )
        );
      }

      if (trustPolicyExclude && semver.lt(pnpmVersion, '10.22.0')) {
        terminal.writeWarningLine(
          Colorize.yellow(
            `Your version of PNPM (${pnpmVersion}) ` +
              `doesn't support the "trustPolicyExclude" field in ` +
              `${rushConfiguration.commonRushConfigFolder}/${RushConstants.pnpmConfigFilename}. ` +
              'Remove this field or upgrade to PNPM 10.22.0 or newer.'
          )
        );
      }

      if (trustPolicyIgnoreAfter !== undefined && semver.lt(pnpmVersion, '10.27.0')) {
        terminal.writeWarningLine(
          Colorize.yellow(
            `Your version of PNPM (${pnpmVersion}) ` +
              `doesn't support the "trustPolicyIgnoreAfterMinutes" field in ` +
              `${rushConfiguration.commonRushConfigFolder}/${RushConstants.pnpmConfigFilename}. ` +
              'Remove this field or upgrade to PNPM 10.27.0 or newer.'
          )
        );
      }

      additionalCommonPackageJsonPropertiesToMerge = unsupportedPackageJsonSettings;

      pnpmSection = {
        overrides,
        packageExtensions,
        peerDependencyRules,
        neverBuiltDependencies,
        onlyBuiltDependencies,
        ignoredOptionalDependencies,
        allowedDeprecatedVersions,
        patchedDependencies,
        trustPolicy,
        trustPolicyExclude,
        trustPolicyIgnoreAfter
      };
    }

    // Add any preferred versions to the top of the commonPackageJson
    // do this in alphabetical order for simpler debugging
    const sortedDependencyEntries: [string, string][] = Array.from(dependenciesMap.entries()).sort(
      ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)
    );
    const dependencies: Record<string, string> = Object.fromEntries(sortedDependencyEntries);
    const commonPackageJson: ICommonPackageJson = {
      dependencies,
      description: 'Temporary file generated by the Rush tool',
      name: 'rush-common',
      private: true,
      version: '0.0.0',
      pnpm: pnpmSection
    };

    if (additionalCommonPackageJsonPropertiesToMerge) {
      merge(commonPackageJson, additionalCommonPackageJsonPropertiesToMerge);
    }

    // Example: "C:\MyRepo\common\temp\package.json"
    const commonPackageJsonFilename: string = `${subspace.getSubspaceTempFolderPath()}/${FileConstants.PackageJson}`;

    // Don't update the file timestamp unless the content has changed, since "rush install"
    // will consider this timestamp
    await JsonFile.saveAsync(commonPackageJson, commonPackageJsonFilename, {
      onlyIfChanged: true,
      ignoreUndefinedValues: true
    });
  }

  public static getPackageManagerEnvironment(
    rushConfiguration: RushConfiguration,
    options: {
      debug?: boolean;
    } = {}
  ): NodeJS.ProcessEnv {
    let configurationEnvironment: IConfigurationEnvironment | undefined = undefined;

    if (rushConfiguration.packageManager === 'npm') {
      configurationEnvironment = rushConfiguration.npmOptions?.environmentVariables;
    } else if (rushConfiguration.isPnpm) {
      configurationEnvironment = rushConfiguration.pnpmOptions?.environmentVariables;
    } else if (rushConfiguration.packageManager === 'yarn') {
      configurationEnvironment = rushConfiguration.yarnOptions?.environmentVariables;
    }

    return InstallHelpers._mergeEnvironmentVariables(process.env, configurationEnvironment, options);
  }

  /**
   * If the "(p)npm-local" symlink hasn't been set up yet, this creates it, installing the
   * specified (P)npm version in the user's home directory if needed.
   */
  public static async ensureLocalPackageManagerAsync(
    rushConfiguration: RushConfiguration,
    rushGlobalFolder: RushGlobalFolder,
    maxInstallAttempts: number,
    restrictConsoleOutput?: boolean
  ): Promise<void> {
    let logIfConsoleOutputIsNotRestricted: (message?: string) => void;
    if (restrictConsoleOutput) {
      logIfConsoleOutputIsNotRestricted = () => {
        /* noop */
      };
    } else {
      logIfConsoleOutputIsNotRestricted = (message?: string) => {
        // eslint-disable-next-line no-console
        console.log(message);
      };
    }

    // Example: "C:\Users\YourName\.rush"
    const rushUserFolder: string = rushGlobalFolder.nodeSpecificPath;

    if (!FileSystem.exists(rushUserFolder)) {
      logIfConsoleOutputIsNotRestricted('Creating ' + rushUserFolder);
      FileSystem.ensureFolder(rushUserFolder);
    }

    const packageManager: PackageManagerName = rushConfiguration.packageManager;
    const packageManagerVersion: string = rushConfiguration.packageManagerToolVersion;

    const packageManagerAndVersion: string = `${packageManager}-${packageManagerVersion}`;
    // Example: "C:\Users\YourName\.rush\pnpm-1.2.3"
    const packageManagerToolFolder: string = `${rushUserFolder}/${packageManagerAndVersion}`;

    const packageManagerMarker: LastInstallFlag = new LastInstallFlag(packageManagerToolFolder, {
      node: process.versions.node
    });

    logIfConsoleOutputIsNotRestricted(`Trying to acquire lock for ${packageManagerAndVersion}`);

    const lock: LockFile = await LockFile.acquireAsync(rushUserFolder, packageManagerAndVersion);

    logIfConsoleOutputIsNotRestricted(`Acquired lock for ${packageManagerAndVersion}`);

    if (!(await packageManagerMarker.isValidAsync()) || lock.dirtyWhenAcquired) {
      logIfConsoleOutputIsNotRestricted(
        Colorize.bold(`Installing ${packageManager} version ${packageManagerVersion}\n`)
      );

      // note that this will remove the last-install flag from the directory
      await Utilities.installPackageInDirectoryAsync({
        directory: packageManagerToolFolder,
        packageName: packageManager,
        version: rushConfiguration.packageManagerToolVersion,
        tempPackageTitle: `${packageManager}-local-install`,
        maxInstallAttempts: maxInstallAttempts,
        // This is using a local configuration to install a package in a shared global location.
        // Generally that's a bad practice, but in this case if we can successfully install
        // the package at all, we can reasonably assume it's good for all the repositories.
        // In particular, we'll assume that two different NPM registries cannot have two
        // different implementations of the same version of the same package.
        // This was needed for: https://github.com/microsoft/rushstack/issues/691
        commonRushConfigFolder: rushConfiguration.commonRushConfigFolder,
        // Only filter npm-incompatible properties when the repo uses pnpm or yarn.
        // If the repo uses npm, the .npmrc is already configured for npm, so don't filter.
        filterNpmIncompatibleProperties: rushConfiguration.packageManager !== 'npm'
      });

      logIfConsoleOutputIsNotRestricted(
        `Successfully installed ${packageManager} version ${packageManagerVersion}`
      );
    } else {
      logIfConsoleOutputIsNotRestricted(
        `Found ${packageManager} version ${packageManagerVersion} in ${packageManagerToolFolder}`
      );
    }

    await packageManagerMarker.createAsync();

    // Example: "C:\MyRepo\common\temp"
    FileSystem.ensureFolder(rushConfiguration.commonTempFolder);

    // Example: "C:\MyRepo\common\temp\pnpm-local"
    const localPackageManagerToolFolder: string = `${rushConfiguration.commonTempFolder}/${packageManager}-local`;

    logIfConsoleOutputIsNotRestricted(`\nSymlinking "${localPackageManagerToolFolder}"`);
    logIfConsoleOutputIsNotRestricted(`  --> "${packageManagerToolFolder}"`);

    // We cannot use FileSystem.exists() to test the existence of a symlink, because it will
    // return false for broken symlinks.  There is no way to test without catching an exception.
    try {
      await FileSystem.deleteFolderAsync(localPackageManagerToolFolder);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    await FileSystem.createSymbolicLinkJunctionAsync({
      linkTargetPath: packageManagerToolFolder,
      newLinkPath: localPackageManagerToolFolder
    });

    lock.release();
  }

  // Helper for getPackageManagerEnvironment
  private static _mergeEnvironmentVariables(
    baseEnv: NodeJS.ProcessEnv,
    environmentVariables?: IConfigurationEnvironment,
    options: {
      debug?: boolean;
    } = {}
  ): NodeJS.ProcessEnv {
    const packageManagerEnv: NodeJS.ProcessEnv = baseEnv;

    if (environmentVariables) {
      // eslint-disable-next-line guard-for-in
      for (const envVar in environmentVariables) {
        let setEnvironmentVariable: boolean = true;
        // eslint-disable-next-line no-console
        console.log(`\nProcessing definition for environment variable: ${envVar}`);

        if (baseEnv.hasOwnProperty(envVar)) {
          setEnvironmentVariable = false;
          // eslint-disable-next-line no-console
          console.log(`Environment variable already defined:`);
          // eslint-disable-next-line no-console
          console.log(`  Name: ${envVar}`);
          // eslint-disable-next-line no-console
          console.log(`  Existing value: ${baseEnv[envVar]}`);
          // eslint-disable-next-line no-console
          console.log(
            `  Value set in ${RushConstants.rushJsonFilename}: ${environmentVariables[envVar].value}`
          );

          if (environmentVariables[envVar].override) {
            setEnvironmentVariable = true;
            // eslint-disable-next-line no-console
            console.log(
              `Overriding the environment variable with the value set in ${RushConstants.rushJsonFilename}.`
            );
          } else {
            // eslint-disable-next-line no-console
            console.log(Colorize.yellow(`WARNING: Not overriding the value of the environment variable.`));
          }
        }

        if (setEnvironmentVariable) {
          if (options.debug) {
            // eslint-disable-next-line no-console
            console.log(`Setting environment variable for package manager.`);
            // eslint-disable-next-line no-console
            console.log(`  Name: ${envVar}`);
            // eslint-disable-next-line no-console
            console.log(`  Value: ${environmentVariables[envVar].value}`);
          }
          packageManagerEnv[envVar] = environmentVariables[envVar].value;
        }
      }
    }

    return packageManagerEnv;
  }
}
