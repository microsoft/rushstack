import * as colors from 'colors';
import * as path from 'path';
import * as semver from 'semver';

import {
  JsonFile,
  FileConstants,
  IPackageJson
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

export const enum DependencyKind {
  DevDependency = 'devDependency',
  Dependency = 'dependency'
}

export interface IUpdateProjectOptions {
  project: RushConfigurationProject;
  packageName: string;
  newVersion: string;
  dependencyKind?: DependencyKind;
  doNotSave?: boolean;
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
      dependencyKind: devDependency ? DependencyKind.DevDependency : DependencyKind.Dependency,
      doNotSave: true
    };
    this.updateProject(currentProjectUpdate);

    currentProjectUpdate.doNotSave = false;
    const packageUpdates: Array<IUpdateProjectOptions> = [currentProjectUpdate];

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
              packageUpdates.push({
                project: this._rushConfiguration.getProjectByName(consumer)!,
                packageName: packageName,
                newVersion: version
              });
            }
          }
        }
      }
    }

    this.updateProjects(packageUpdates);

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

  public updateProjects(projectUpdates: Array<IUpdateProjectOptions>): void {
    for (const update of projectUpdates) {
      this.updateProject(update);
    }
  }

  public updateProject(options: IUpdateProjectOptions): void {
    let { dependencyKind } = options;
    const {
      project,
      packageName,
      newVersion,
      doNotSave
    } = options;
    const packageJson: IPackageJson = project.packageJson;

    let oldDependencyKind: DependencyKind | undefined = undefined;
    if (packageJson.dependencies && packageJson.dependencies[packageName]) {
      oldDependencyKind = DependencyKind.Dependency;
    } else if (packageJson.devDependencies && packageJson.devDependencies[packageName]) {
      oldDependencyKind = DependencyKind.DevDependency;
    }

    if (!dependencyKind && !oldDependencyKind) {
      throw new Error(`Cannot auto-detect dependency type of "${packageName}" for project "${project.packageName}"`);
    }

    if (!dependencyKind) {
      dependencyKind = oldDependencyKind;
    }

    // update the dependency
    if (dependencyKind === DependencyKind.Dependency) {
      packageJson.dependencies = this._updateDependency(packageJson.dependencies, packageName, newVersion);
    } else if (dependencyKind === DependencyKind.DevDependency) {
      packageJson.devDependencies = this._updateDependency(packageJson.devDependencies, packageName, newVersion);
    }

    if (!doNotSave) {
      // overwrite existing file
      const packageJsonPath: string
        = path.join(project.projectFolder, FileConstants.PackageJson);
      JsonFile.save(project.packageJson, packageJsonPath);

      console.log(colors.green('Wrote ') + packageJsonPath);
    }
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

  private _updateDependency(dependencies: { [key: string]: string } | undefined,
    packageName: string, version: string):  { [key: string]: string } {
    if (!dependencies) {
      dependencies = {};
    }
    dependencies[packageName] = version!;
    return dependencies;
  }
}