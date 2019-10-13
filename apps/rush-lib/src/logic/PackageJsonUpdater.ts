// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';
import * as semver from 'semver';

import { RushConfiguration } from '../api/RushConfiguration';
import { InstallManager, IInstallManagerOptions } from './InstallManager';
import { VersionMismatchFinder } from './versionMismatch/VersionMismatchFinder';
import { PurgeManager } from './PurgeManager';
import { Utilities } from '../utilities/Utilities';
import {
  DependencyType,
  PackageJsonDependency
} from '../api/PackageJsonEditor';
import { RushGlobalFolder } from '../api/RushGlobalFolder';
import { RushConfigurationProject } from '../api/RushConfigurationProject';
import { VersionMismatchFinderEntity } from './versionMismatch/VersionMismatchFinderEntity';
import { VersionMismatchFinderProject } from './versionMismatch/VersionMismatchFinderProject';

/**
 * The type of SemVer range specifier that is prepended to the version
 */
export const enum SemVerStyle {
  Exact = 'exact',
  Caret = 'caret',
  Tilde = 'tilde',
  Passthrough = 'passthrough'
}

/**
 * Options for adding a dependency to a particular project.
 */
export interface IPackageJsonUpdaterRushAddOptions {
  /**
   * The projects whose package.jsons should get updated
   */
  projects: RushConfigurationProject[];
  /**
   * The name of the dependency to be added
   */
  packageName: string;
  /**
   * The initial version specifier.
   * If undefined, the latest version will be used (that doesn't break ensureConsistentVersions).
   * If specified, the latest version meeting the SemVer specifier will be used as the basis.
   */
  initialVersion: string | undefined;
  /**
   * Whether or not this dependency should be added as a devDependency or a regular dependency.
   */
  devDependency: boolean;
  /**
   * If specified, other packages that use this dependency will also have their package.json's updated.
   */
  updateOtherPackages: boolean;
  /**
   * If specified, "rush update" will not be run after updating the package.json file(s).
   */
  skipUpdate: boolean;
  /**
   * If specified, "rush update" will be run in debug mode.
   */
  debugInstall: boolean;
  /**
   * The style of range that should be used if the version is automatically detected.
   */
  rangeStyle: SemVerStyle;
  /**
   * The variant to consider when performing installations and validating shrinkwrap updates.
   */
  variant?: string | undefined;
}

/**
 * Configuration options for adding or updating a dependency in a single project
 */
export interface IUpdateProjectOptions {
  /**
   * The project which will have its package.json updated
   */
  project: VersionMismatchFinderEntity;
  /**
   * The name of the dependency to be added or updated in the project
   */
  packageName: string;
  /**
   * The new SemVer specifier that should be added to the project's package.json
   */
  newVersion: string;
  /**
   * The type of dependency that should be updated. If left empty, this will be auto-detected.
   * If it cannot be auto-detected an exception will be thrown.
   */
  dependencyType?: DependencyType;
}

/**
 * A helper class for managing the dependencies of various package.json files.
 * @internal
 */
export class PackageJsonUpdater {
  private _rushConfiguration: RushConfiguration;
  private _rushGlobalFolder: RushGlobalFolder;

  public constructor(rushConfiguration: RushConfiguration, rushGlobalFolder: RushGlobalFolder) {
    this._rushConfiguration = rushConfiguration;
    this._rushGlobalFolder = rushGlobalFolder;
  }

  /**
   * Adds a dependency to a particular project. The core business logic for "rush add".
   */
  public async doRushAdd(options: IPackageJsonUpdaterRushAddOptions): Promise<void> {
    const {
      projects,
      packageName,
      initialVersion,
      devDependency,
      updateOtherPackages,
      skipUpdate,
      debugInstall,
      rangeStyle,
      variant
    } = options;

    const implicitlyPinned: Map<string, string> = InstallManager.collectImplicitlyPreferredVersions(
      this._rushConfiguration,
      {
        variant
      }
    );

    const purgeManager: PurgeManager = new PurgeManager(this._rushConfiguration, this._rushGlobalFolder);
    const installManagerOptions: IInstallManagerOptions = {
      debug: debugInstall,
      allowShrinkwrapUpdates: true,
      bypassPolicy: false,
      noLink: false,
      fullUpgrade: false,
      recheckShrinkwrap: false,
      networkConcurrency: undefined,
      collectLogFile: false,
      variant: variant
    };
    const installManager: InstallManager = new InstallManager(
      this._rushConfiguration,
      this._rushGlobalFolder,
      purgeManager,
      installManagerOptions
    );

    const version: string = await this._getNormalizedVersionSpec(
      installManager,
      packageName,
      initialVersion,
      implicitlyPinned.get(packageName),
      rangeStyle
    );

    console.log();
    console.log(colors.green(`Updating projects to use `) + packageName + '@' + colors.cyan(version));
    console.log();

    const allPackageUpdates: IUpdateProjectOptions[] = [];

    for (const project of projects) {
      const currentProjectUpdate: IUpdateProjectOptions = {
        project: new VersionMismatchFinderProject(project),
        packageName,
        newVersion: version,
        dependencyType: devDependency ? DependencyType.Dev : undefined
      };
      this.updateProject(currentProjectUpdate);

      const otherPackageUpdates: Array<IUpdateProjectOptions> = [];

      if (this._rushConfiguration.ensureConsistentVersions || updateOtherPackages) {
        // we need to do a mismatch check
        const mismatchFinder: VersionMismatchFinder = VersionMismatchFinder.getMismatches(this._rushConfiguration, {
          variant: variant
        });

        const mismatches: Array<string> = mismatchFinder.getMismatches().filter((mismatch) => {
          return !projects.find((proj) => proj.packageName === mismatch);
        });
        if (mismatches.length) {
          if (!updateOtherPackages) {
            throw new Error(`Adding '${packageName}@${version}' to ${project.packageName}`
              + ` causes mismatched dependencies. Use the "--make-consistent" flag to update other packages to use`
              + ` this version, or do not specify a SemVer range.`);
          }

          // otherwise we need to go update a bunch of other projects
          const mismatchedVersions: Array<string> | undefined = mismatchFinder.getVersionsOfMismatch(packageName);
          if (mismatchedVersions) {
            for (const mismatchedVersion of mismatchedVersions) {
              for (const consumer of mismatchFinder.getConsumersOfMismatch(packageName, mismatchedVersion)!) {
                if (consumer instanceof VersionMismatchFinderProject) {
                  otherPackageUpdates.push({
                    project: consumer,
                    packageName: packageName,
                    newVersion: version
                  });
                }
              }
            }
          }
        }
      }

      this.updateProjects(otherPackageUpdates);

      allPackageUpdates.push(currentProjectUpdate, ...otherPackageUpdates);
    }

    for (const { project } of allPackageUpdates) {
      if (project.saveIfModified()) {
        console.log(colors.green('Wrote ') + project.filePath);
      }
    }

    if (!skipUpdate) {
      console.log();
      console.log(colors.green('Running "rush update"'));
      console.log();
      try {
        await installManager.doInstall();
      } finally {
        purgeManager.deleteAll();
      }
    }
  }

  /**
   * Updates several projects' package.json files
   */
  public updateProjects(projectUpdates: Array<IUpdateProjectOptions>): void {
    for (const update of projectUpdates) {
      this.updateProject(update);
    }
  }

  /**
   * Updates a single project's package.json file
   */
  public updateProject(options: IUpdateProjectOptions): void {
    let { dependencyType } = options;
    const {
      project,
      packageName,
      newVersion
    } = options;

    const oldDependency: PackageJsonDependency | undefined = project.tryGetDependency(packageName);
    const oldDevDependency: PackageJsonDependency | undefined = project.tryGetDevDependency(packageName);

    const oldDependencyType: DependencyType | undefined = oldDevDependency
      ? oldDevDependency.dependencyType
      : (oldDependency ? oldDependency.dependencyType : undefined);

    dependencyType = dependencyType || oldDependencyType || DependencyType.Regular;

    project.addOrUpdateDependency(packageName, newVersion, dependencyType!);
  }

  /**
   * Selects an appropriate version number for a particular package, given an optional initial SemVer spec.
   * If ensureConsistentVersions, tries to pick a version that will be consistent.
   * Otherwise, will choose the latest semver matching the initialSpec and append the proper range style.
   * @param packageName - the name of the package to be used
   * @param initialSpec - a semver pattern that should be used to find the latest version matching the spec
   * @param implicitlyPinnedVersion - the implicitly preferred (aka common/primary) version of the package in use
   * @param rangeStyle - if this version is selected by querying registry, then this range specifier is prepended to
   *   the selected version.
   */
  private async _getNormalizedVersionSpec(
    installManager: InstallManager,
    packageName: string,
    initialSpec: string | undefined,
    implicitlyPinnedVersion: string | undefined,
    rangeStyle: SemVerStyle
  ): Promise<string> {
    console.log(colors.gray(`Determining new version for dependency: ${packageName}`));
    if (initialSpec) {
      console.log(`Specified version selector: ${colors.cyan(initialSpec)}`);
    } else {
      console.log(`No version selector was specified, so the version will be determined automatically.`);
    }
    console.log();

    // if ensureConsistentVersions => reuse the pinned version
    // else, query the registry and use the latest that satisfies semver spec
    if (initialSpec && implicitlyPinnedVersion && initialSpec === implicitlyPinnedVersion) {
      console.log(colors.green('Assigning "')
        + colors.cyan(initialSpec)
        + colors.green(`" for "${packageName}" because it matches what other projects are using in this repo.`));
      return initialSpec;
    }

    if (this._rushConfiguration.ensureConsistentVersions && !initialSpec && implicitlyPinnedVersion) {
      console.log(`Assigning the version range "${colors.cyan(implicitlyPinnedVersion)}" for "${packageName}" because`
        + ` it is already used by other projects in this repo.`);
      return implicitlyPinnedVersion;
    }

    await installManager.ensureLocalPackageManager();
    let selectedVersion: string | undefined;

    if (initialSpec && initialSpec !== 'latest') {
      console.log(colors.gray('Finding versions that satisfy the selector: ') + initialSpec);
      console.log();
      console.log(`Querying registry for all versions of "${packageName}"...`);

      let commandArgs: Array<string> = ['view', packageName, 'versions', '--json'];
      if (this._rushConfiguration.packageManager === 'yarn') {
        commandArgs = ['info', packageName, 'versions', '--json']
      }

      const allVersions: string =
        Utilities.executeCommandAndCaptureOutput(
          this._rushConfiguration.packageManagerToolFilename,
          commandArgs,
          this._rushConfiguration.commonTempFolder
        );

        let versionList: Array<string>;

        if(this._rushConfiguration.packageManager === 'yarn') {
          versionList = JSON.parse(allVersions).data;
        } else {
          versionList = JSON.parse(allVersions);
        }

      
      console.log(colors.gray(`Found ${versionList.length} available versions.`));

      for (const version of versionList) {
        if (semver.satisfies(version, initialSpec)) {
          selectedVersion = initialSpec;
          console.log(`Found a version that satisfies ${initialSpec}: ${colors.cyan(version)}`);
          break;
        }
      }

      if (!selectedVersion) {
        throw new Error(`Unable to find a version of "${packageName}" that satisfies`
          + ` the version specifier "${initialSpec}"`);
      }
    } else {
      if (!this._rushConfiguration.ensureConsistentVersions) {
        console.log(colors.gray(`The "ensureConsistentVersions" policy is NOT active,`
          + ` so we will assign the latest version.`));
        console.log();
      }
      console.log(`Querying NPM registry for latest version of "${packageName}"...`);

      let commandArgs: Array<string> = ['view', `${packageName}@latest`, 'version'];
      if (this._rushConfiguration.packageManager === 'yarn') {
        commandArgs = ['info', packageName, 'dist-tags.latest', '--silent']
      }

      selectedVersion = Utilities.executeCommandAndCaptureOutput(
        this._rushConfiguration.packageManagerToolFilename,
        commandArgs,
        this._rushConfiguration.commonTempFolder
      ).trim();

      console.log();

      console.log(`Found latest version: ${colors.cyan(selectedVersion)}`);
    }

    console.log();

    switch (rangeStyle) {
      case SemVerStyle.Caret: {
        console.log(colors.grey(`Assigning version "^${selectedVersion}" for "${packageName}" because the "--caret"`
          + ` flag was specified.`));
        return `^${selectedVersion}`;
      }

      case SemVerStyle.Exact: {
        console.log(colors.grey(`Assigning version "${selectedVersion}" for "${packageName}" because the "--exact"`
          + ` flag was specified.`));
        return selectedVersion;
      }

      case SemVerStyle.Tilde: {
        console.log(colors.gray(`Assigning version "~${selectedVersion}" for "${packageName}".`));
        return `~${selectedVersion}`;
      }

      case SemVerStyle.Passthrough: {
        console.log(colors.gray(`Assigning version "${selectedVersion}" for "${packageName}".`));
        return selectedVersion;
      }

      default: {
        throw new Error(`Unexpected SemVerStyle ${rangeStyle}.`);
      }
    }
  }
}
