import * as path from 'path';
import * as semver from 'semver';

import {
  JsonFile,
  FileConstants
} from '@microsoft/node-core-library';

import { RushConfiguration } from '../api/RushConfiguration';
import { InstallManager, IInstallManagerOptions } from './InstallManager';
import { RushConfigurationProject } from '../api/RushConfigurationProject';
import { VersionMismatchFinder } from '../api/VersionMismatchFinder';
import { PurgeManager } from './PurgeManager';
import { Utilities } from '../utilities/Utilities';

export const enum SemVerStyle {
  Exact = 'exact',
  Caret = 'caret',
  Tilde = 'tilde'
}

export interface IDependencyIntegratorOptions {
  currentProject: RushConfigurationProject;
  packageName: string;
  initialVersion: string | undefined;
  devDependency: boolean;
  updateOtherPackages: boolean;
  skipInstall: boolean;
  debugInstall: boolean;
  rangeStyle: SemVerStyle;
}

export class DependencyIntegrator {
  private _rushConfiguration: RushConfiguration;

  public constructor(rushConfiguration: RushConfiguration) {
    this._rushConfiguration = rushConfiguration;
  }

  public run(options: IDependencyIntegratorOptions): Promise<void> {
    const {
      currentProject,
      packageName,
      initialVersion,
      devDependency,
      updateOtherPackages,
      skipInstall,
      debugInstall,
      rangeStyle
    } = options;

    const implicitlyPinned: Map<string, string>
      = InstallManager.collectImplicitlyPreferredVersions(this._rushConfiguration);

    console.log(`implicitlyPinned size: ${implicitlyPinned.size}`);

    const version: string = this._getNormalizedVersionSpec(
      packageName, initialVersion, implicitlyPinned.get(packageName), rangeStyle);

    if (devDependency) {
      currentProject.packageJson.devDependencies
        = this._updateDependency(currentProject.packageJson.devDependencies, packageName, version);
    } else {
      currentProject.packageJson.dependencies
        = this._updateDependency(currentProject.packageJson.dependencies, packageName, version);
    }

    if (this._rushConfiguration.enforceConsistentVersions) {
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
            if (packageName !== currentProject.packageName) {
              const consumerProject: RushConfigurationProject = this._rushConfiguration.getProjectByName(consumer)!;

              if (consumerProject.packageJson.devDependencies
                && consumerProject.packageJson.devDependencies[packageName]) {
                consumerProject.packageJson.devDependencies
                  = this._updateDependency(consumerProject.packageJson.devDependencies, packageName, version);
              } else {
                consumerProject.packageJson.dependencies
                  = this._updateDependency(consumerProject.packageJson.dependencies, packageName, version);
              }

              // overwrite existing file
              const consumerPackageJsonPath: string
                = path.join(consumerProject.projectFolder, FileConstants.PackageJson);
              JsonFile.save(consumerProject.packageJson, consumerPackageJsonPath);
            }
          }
        }
      }
    }

    // overwrite existing file
    JsonFile.save(currentProject.packageJson, path.join(currentProject.projectFolder, FileConstants.PackageJson));

    if (skipInstall) {
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

  private _getNormalizedVersionSpec(
    packageName: string,
    initialSpec: string | undefined,
    implicitlyPinnedVersion: string | undefined,
    rangeStyle: SemVerStyle ): string {
    console.log(`_getNormalizedVersionSpec()`);
    console.log(`packageName: ${packageName}`);
    console.log(`initialSpec: ${initialSpec}`);
    console.log(`implicitlyPinnedVersion: ${implicitlyPinnedVersion}`);

    // if ensureConsistentVersions => reuse the pinned version
    // else, query the registry and use the latest that satisfies semver spec
    if (initialSpec && implicitlyPinnedVersion && initialSpec === implicitlyPinnedVersion) {
      return initialSpec;
    }

    if (this._rushConfiguration.enforceConsistentVersions && !initialSpec && implicitlyPinnedVersion) {
      return implicitlyPinnedVersion;
    }

    let selectedVersion: string | undefined;

    if (initialSpec && initialSpec !== 'latest') {
      const allVersions: string =
        Utilities.executeCommandAndCaptureOutput(this._rushConfiguration.packageManagerToolFilename,
          ['view', packageName, 'versions', '--json'],
          this._rushConfiguration.commonTempFolder);

      let versionList: Array<string> = JSON.parse(allVersions);
      versionList = versionList.sort((a: string, b: string) => { return semver.gt(a, b) ? -1 : 1; });

      for (const version of versionList) {
        if (semver.satisfies(version, initialSpec)) {
          selectedVersion = version;
          break;
        }
      }
      if (!selectedVersion) {
        throw new Error(`Cannot find version for ${packageName} that satisfies '${initialSpec}'`);
      }
    } else {
        selectedVersion = Utilities.executeCommandAndCaptureOutput(this._rushConfiguration.packageManagerToolFilename,
          ['view', `${packageName}@latest`, 'version'],
          this._rushConfiguration.commonTempFolder).trim();
    }

    if (rangeStyle === SemVerStyle.Caret) {
      return '^' + selectedVersion;
    } else if (rangeStyle === SemVerStyle.Exact) {
      return selectedVersion;
    } else {
      return '~' + selectedVersion!;
    }
  }

  private _updateDependency(dependencies: { [key: string]: string } | undefined,
    packageName: string, version: string):  { [key: string]: string } {
    if (!dependencies) {
      dependencies = {};
    }
    dependencies[packageName] = version!;
    return dependencies;
  }
}