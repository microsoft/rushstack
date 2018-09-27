// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';
import * as semver from 'semver';

import { RushConfiguration } from '../api/RushConfiguration';
import { InstallManager, IInstallManagerOptions } from './InstallManager';
import { RushConfigurationProject } from '../api/RushConfigurationProject';
import { VersionMismatchFinder } from '../api/VersionMismatchFinder';
import { PurgeManager } from './PurgeManager';
import { Utilities } from '../utilities/Utilities';
import { DependencyType, PackageJsonEditor, Dependency } from '../api/PackageJsonEditor';

/**
 * The type of SemVer range specifier that is prepended to the version
 */
export const enum SemVerStyle {
  Exact = 'exact',
  Caret = 'caret',
  Tilde = 'tilde'
}

/**
 * Options for adding a dependency to a particular project.
 */
export interface IPackageJsonUpdaterRushAddOptions {
  /**
   * The project whose package.json should get updated
   */
  currentProject: RushConfigurationProject;
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
}

/**
 * Configuration options for adding or updating a dependency in a single project
 */
export interface IUpdateProjectOptions {
  /**
   * The project which will have its package.json updated
   */
  project: RushConfigurationProject;
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

  public constructor(rushConfiguration: RushConfiguration) {
    this._rushConfiguration = rushConfiguration;
  }

  /**
   * Adds a dependency to a particular project. The core business logic for "rush add".
   */
  public doRushAdd(options: IPackageJsonUpdaterRushAddOptions): Promise<void> {
    const {
      currentProject,
      packageName,
      initialVersion,
      devDependency,
      updateOtherPackages,
      skipUpdate,
      debugInstall,
      rangeStyle
    } = options;

    const implicitlyPinned: Map<string, string>
      = InstallManager.collectImplicitlyPreferredVersions(this._rushConfiguration);

    const version: string = this._getNormalizedVersionSpec(
      packageName, initialVersion, implicitlyPinned.get(packageName), rangeStyle);

    console.log();
    console.log(colors.green(`Updating projects to use `)
      + packageName + '@' + colors.magenta(version));
    console.log();

    const currentProjectUpdate: IUpdateProjectOptions = {
      project: currentProject,
      packageName,
      newVersion: version,
      dependencyType: devDependency ? DependencyType.DevDependency : DependencyType.Dependency
    };
    this.updateProject(currentProjectUpdate);

    const otherPackageUpdates: Array<IUpdateProjectOptions> = [];

    if (this._rushConfiguration.ensureConsistentVersions) {
      // we need to do a mismatch check
      const mismatchFinder: VersionMismatchFinder = VersionMismatchFinder.getMismatches(this._rushConfiguration);

      const mismatches: Array<string> = mismatchFinder.getMismatches();
      if (mismatches.length) {
        if (!updateOtherPackages) {
          return Promise.reject(new Error(`Adding '${packageName}@${version}' to ${currentProject.packageName}`
            + ` causes mismatched dependencies. Use the --make-consistent flag to update other packages to use this`
            + ` version, or do not specify the --version flag.`));
        }

        // otherwise we need to go update a bunch of other projects
        for (const mismatchedVersion of mismatchFinder.getVersionsOfMismatch(packageName)!) {
          for (const consumer of mismatchFinder.getConsumersOfMismatch(packageName, mismatchedVersion)!) {
            if (consumer !== currentProject.packageName) {
              otherPackageUpdates.push({
                project: this._rushConfiguration.getProjectByName(consumer)!,
                packageName: packageName,
                newVersion: version
              });
            }
          }
        }
      }
    }

    this.updateProjects(otherPackageUpdates);

    for (const project of this._rushConfiguration.projects) {
      if (project.packageJsonEditor.saveIfModified()) {
        console.log(colors.green('Wrote ') + project.packageJsonEditor.filePath);
      }
    }

    if (skipUpdate) {
      return Promise.resolve();
    }

    const purgeManager: PurgeManager = new PurgeManager(this._rushConfiguration);
    const installManager: InstallManager = new InstallManager(this._rushConfiguration, purgeManager);
    const installManagerOptions: IInstallManagerOptions = {
      debug: debugInstall,
      allowShrinkwrapUpdates: true,
      bypassPolicy: false,
      noLink: false,
      fullUpgrade: false,
      recheckShrinkwrap: false,
      networkConcurrency: undefined,
      collectLogFile: true
    };

    return installManager.doInstall(installManagerOptions)
      .then(() => {
        purgeManager.deleteAll();
      })
      .catch((error) => {
        purgeManager.deleteAll();
        throw error;
      });
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
    const packageJson: PackageJsonEditor = project.packageJsonEditor;

    const oldDependency: Dependency | undefined = packageJson.getDependency(packageName);
    const oldDependencyType: DependencyType | undefined = oldDependency ? oldDependency.dependencyType : undefined;

    if (!dependencyType && !oldDependencyType) {
      throw new Error(`Cannot auto-detect dependency type of "${packageName}" for project "${project.packageName}"`);
    }

    if (!dependencyType) {
      dependencyType = oldDependencyType;
    }

    packageJson.addOrUpdateDependency(packageName, newVersion, dependencyType!);
  }

  private _getNormalizedVersionSpec(
    packageName: string,
    initialSpec: string | undefined,
    implicitlyPinnedVersion: string | undefined,
    rangeStyle: SemVerStyle): string {

    console.log(colors.gray(`Determining new version for dependency: ${packageName}`));
    if (initialSpec) {
      console.log(`Specified version selector: ${colors.magenta(initialSpec)}`);
    } else {
      console.log(`No version selector specified, will be automatically determined.`);
    }
    console.log();

    // if ensureConsistentVersions => reuse the pinned version
    // else, query the registry and use the latest that satisfies semver spec
    if (initialSpec && implicitlyPinnedVersion && initialSpec === implicitlyPinnedVersion) {
      console.log(colors.green('The specified version ')
        + colors.magenta(initialSpec)
        + colors.green(' has been selected as it matches the implicitly preferred version.'));
      return initialSpec;
    }

    if (this._rushConfiguration.ensureConsistentVersions && !initialSpec && implicitlyPinnedVersion) {
      console.log(colors.grey('The enforceConsistentVersions policy is currently active.'));
      console.log(`Using the implicitly preferred version ${colors.magenta(implicitlyPinnedVersion)}`);
      return implicitlyPinnedVersion;
    }

    let selectedVersion: string | undefined;

    if (initialSpec && initialSpec !== 'latest') {
      console.log(colors.gray('Finding newest version that satisfies the selector: ') + initialSpec);
      console.log();
      console.log(`Querying registry for all versions of ${packageName}...`);
      const allVersions: string =
        Utilities.executeCommandAndCaptureOutput(this._rushConfiguration.packageManagerToolFilename,
          ['view', packageName, 'versions', '--json'],
          this._rushConfiguration.commonTempFolder);

      let versionList: Array<string> = JSON.parse(allVersions);
      versionList = versionList.sort((a: string, b: string) => { return semver.gt(a, b) ? -1 : 1; });

      console.log(colors.gray(`Found ${versionList.length} available versions.`));

      for (const version of versionList) {
        if (semver.satisfies(version, initialSpec)) {
          selectedVersion = version;
          console.log(`Found latest version: ${colors.magenta(selectedVersion)}`);
          break;
        }
      }
      if (!selectedVersion) {
        throw new Error(`Cannot find version for ${packageName} that satisfies '${initialSpec}'`);
      }
    } else {
      if (initialSpec !== 'latest') {
        console.log(colors.gray(`The enforceConsistentVersions policy is NOT active,`
          + ` therefore using the latest version.`));
        console.log();
      }
      console.log(`Querying NPM registry for latest version of ${packageName}...`);

      selectedVersion = Utilities.executeCommandAndCaptureOutput(this._rushConfiguration.packageManagerToolFilename,
        ['view', `${packageName}@latest`, 'version'],
        this._rushConfiguration.commonTempFolder).trim();
      console.log();

      console.log(`Found latest version: ${colors.magenta(selectedVersion)}`);
    }

    console.log();

    if (rangeStyle === SemVerStyle.Caret) {
      console.log(colors.gray('The --caret flag was specified, prepending ^ specifier to version.'));
      return '^' + selectedVersion;
    } else if (rangeStyle === SemVerStyle.Exact) {
      console.log(colors.gray('The --exact flag was specified, not prepending a specifier to version.'));
      return selectedVersion;
    } else {
      console.log(colors.gray('Prepending ~ specifier to version.'));
      return '~' + selectedVersion!;
    }
  }
}