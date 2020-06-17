// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';
import * as os from 'os';
import * as path from 'path';
import * as semver from 'semver';
import {
  FileConstants,
  FileSystem,
  IPackageJson,
  JsonFile,
  LockFile,
  MapExtensions
} from '@rushstack/node-core-library';

import { CommonVersionsConfiguration } from '../../api/CommonVersionsConfiguration';
import { LastInstallFlag } from '../../api/LastInstallFlag';
import { PackageJsonDependency } from '../../api/PackageJsonEditor';
import { PackageManagerName } from '../../api/packageManager/PackageManager';
import { RushConfiguration, IConfigurationEnvironment } from '../../api/RushConfiguration';
import { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { RushGlobalFolder } from '../../api/RushGlobalFolder';
import { Utilities } from '../../utilities/Utilities';

export class InstallHelpers {
  /**
   * Returns a map containing all preferred versions for a Rush project.
   * Returns a map: dependency name --> version specifier
   */
  public static collectPreferredVersions(
    rushConfiguration: RushConfiguration,
    options: {
      explicitPreferredVersions?: Map<string, string>;
      variant?: string | undefined;
    } = {}
  ): Map<string, string> {
    // dependency name --> version specifier
    const allExplicitPreferredVersions: Map<string, string> = options.explicitPreferredVersions
      ? options.explicitPreferredVersions
      : rushConfiguration.getCommonVersions(options.variant).getAllPreferredVersions();

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
      const implicitlyPreferredVersions: Map<
        string,
        string
      > = InstallHelpers.collectImplicitlyPreferredVersions(rushConfiguration, options);
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
      variant?: string | undefined;
    } = {}
  ): Map<string, string> {
    // First, collect all the direct dependencies of all local projects, and their versions:
    // direct dependency name --> set of version specifiers
    const versionsForDependencies: Map<string, Set<string>> = new Map<string, Set<string>>();

    rushConfiguration.projects.forEach((project: RushConfigurationProject) => {
      InstallHelpers._collectVersionsForDependencies(rushConfiguration, {
        versionsForDependencies,
        dependencies: project.packageJsonEditor.dependencyList,
        cyclicDependencies: project.cyclicDependencyProjects,
        variant: options.variant
      });

      InstallHelpers._collectVersionsForDependencies(rushConfiguration, {
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

  public static generateCommonPackageJson(
    rushConfiguration: RushConfiguration,
    dependencies: Map<string, string>
  ): void {
    const commonPackageJson: IPackageJson = {
      dependencies: {},
      description: 'Temporary file generated by the Rush tool',
      name: 'rush-common',
      private: true,
      version: '0.0.0'
    };

    // Add any preferred versions to the top of the commonPackageJson
    // do this in alphabetical order for simpler debugging
    for (const dependency of Array.from(dependencies.keys()).sort()) {
      commonPackageJson.dependencies![dependency] = dependencies.get(dependency)!;
    }

    // Example: "C:\MyRepo\common\temp\package.json"
    const commonPackageJsonFilename: string = path.join(
      rushConfiguration.commonTempFolder,
      FileConstants.PackageJson
    );

    // Don't update the file timestamp unless the content has changed, since "rush install"
    // will consider this timestamp
    JsonFile.save(commonPackageJson, commonPackageJsonFilename, { onlyIfChanged: true });
  }

  public static getPackageManagerEnvironment(
    rushConfiguration: RushConfiguration,
    options: {
      debug?: boolean;
    } = {}
  ): NodeJS.ProcessEnv {
    let configurationEnvironment: IConfigurationEnvironment | undefined = undefined;

    if (rushConfiguration.packageManager === 'npm') {
      if (rushConfiguration.npmOptions && rushConfiguration.npmOptions.environmentVariables) {
        configurationEnvironment = rushConfiguration.npmOptions.environmentVariables;
      }
    } else if (rushConfiguration.packageManager === 'pnpm') {
      if (rushConfiguration.pnpmOptions && rushConfiguration.pnpmOptions.environmentVariables) {
        configurationEnvironment = rushConfiguration.pnpmOptions.environmentVariables;
      }
    } else if (rushConfiguration.packageManager === 'yarn') {
      if (rushConfiguration.yarnOptions && rushConfiguration.yarnOptions.environmentVariables) {
        configurationEnvironment = rushConfiguration.yarnOptions.environmentVariables;
      }
    }

    return InstallHelpers._mergeEnvironmentVariables(process.env, configurationEnvironment, options);
  }

  /**
   * If the "(p)npm-local" symlink hasn't been set up yet, this creates it, installing the
   * specified (P)npm version in the user's home directory if needed.
   */
  public static async ensureLocalPackageManager(
    rushConfiguration: RushConfiguration,
    rushGlobalFolder: RushGlobalFolder,
    maxInstallAttempts: number
  ): Promise<void> {
    // Example: "C:\Users\YourName\.rush"
    const rushUserFolder: string = rushGlobalFolder.nodeSpecificPath;

    if (!FileSystem.exists(rushUserFolder)) {
      console.log('Creating ' + rushUserFolder);
      FileSystem.ensureFolder(rushUserFolder);
    }

    const packageManager: PackageManagerName = rushConfiguration.packageManager;
    const packageManagerVersion: string = rushConfiguration.packageManagerToolVersion;

    const packageManagerAndVersion: string = `${packageManager}-${packageManagerVersion}`;
    // Example: "C:\Users\YourName\.rush\pnpm-1.2.3"
    const packageManagerToolFolder: string = path.join(rushUserFolder, packageManagerAndVersion);

    const packageManagerMarker: LastInstallFlag = new LastInstallFlag(packageManagerToolFolder, {
      node: process.versions.node
    });

    console.log(`Trying to acquire lock for ${packageManagerAndVersion}`);

    const lock: LockFile = await LockFile.acquire(rushUserFolder, packageManagerAndVersion);

    console.log(`Acquired lock for ${packageManagerAndVersion}`);

    if (!packageManagerMarker.isValid() || lock.dirtyWhenAcquired) {
      console.log(colors.bold(`Installing ${packageManager} version ${packageManagerVersion}${os.EOL}`));

      // note that this will remove the last-install flag from the directory
      Utilities.installPackageInDirectory({
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
        commonRushConfigFolder: rushConfiguration.commonRushConfigFolder
      });

      console.log(`Successfully installed ${packageManager} version ${packageManagerVersion}`);
    } else {
      console.log(`Found ${packageManager} version ${packageManagerVersion} in ${packageManagerToolFolder}`);
    }

    packageManagerMarker.create();

    // Example: "C:\MyRepo\common\temp"
    FileSystem.ensureFolder(rushConfiguration.commonTempFolder);

    // Example: "C:\MyRepo\common\temp\pnpm-local"
    const localPackageManagerToolFolder: string = path.join(
      rushConfiguration.commonTempFolder,
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
  }

  // Helper for collectImplicitlyPreferredVersions()
  private static _collectVersionsForDependencies(
    rushConfiguration: RushConfiguration,
    options: {
      versionsForDependencies: Map<string, Set<string>>;
      dependencies: ReadonlyArray<PackageJsonDependency>;
      cyclicDependencies: Set<string>;
      variant: string | undefined;
    }
  ): void {
    const { variant, dependencies, versionsForDependencies, cyclicDependencies } = options;

    const commonVersions: CommonVersionsConfiguration = rushConfiguration.getCommonVersions(variant);

    const allowedAlternativeVersions: Map<string, ReadonlyArray<string>> =
      commonVersions.allowedAlternativeVersions;

    for (const dependency of dependencies) {
      const alternativesForThisDependency: ReadonlyArray<string> =
        allowedAlternativeVersions.get(dependency.name) || [];

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
        const localProject: RushConfigurationProject | undefined = rushConfiguration.getProjectByName(
          dependency.name
        );
        if (localProject) {
          // 2. If it's a symlinked local project, then it's not a candidate, because the package manager will
          //    never even see it.
          // However there are two ways that a local project can NOT be symlinked:
          // - if the local project doesn't satisfy the referenced semver specifier; OR
          // - if the local project was specified in "cyclicDependencyProjects" in rush.json
          if (
            semver.satisfies(localProject.packageJsonEditor.version, dependency.version) &&
            !cyclicDependencies.has(dependency.name)
          ) {
            ignoreVersion = true;
          }
        }

        if (!ignoreVersion) {
          InstallHelpers._updateVersionsForDependencies(
            versionsForDependencies,
            dependency.name,
            dependency.version
          );
        }
      }
    }
  }

  // Helper for collectImplicitlyPreferredVersions()
  private static _updateVersionsForDependencies(
    versionsForDependencies: Map<string, Set<string>>,
    dependency: string,
    version: string
  ): void {
    if (!versionsForDependencies.has(dependency)) {
      versionsForDependencies.set(dependency, new Set<string>());
    }
    versionsForDependencies.get(dependency)!.add(version);
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
          } else {
            console.log(colors.yellow(`WARNING: Not overriding the value of the environment variable.`));
          }
        }

        if (setEnvironmentVariable) {
          if (options.debug) {
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
}
