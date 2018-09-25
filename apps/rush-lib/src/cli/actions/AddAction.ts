// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'os';
import * as path from 'path';
import * as semver from 'semver';

import {
  CommandLineFlagParameter,
  CommandLineStringParameter
} from '@microsoft/ts-command-line';
import {
  JsonFile,
  FileConstants
} from '@microsoft/node-core-library';

import { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { BaseRushAction } from './BaseRushAction';
import { RushCommandLineParser } from '../RushCommandLineParser';
import { InstallManager, IInstallManagerOptions } from '../../logic/InstallManager';
import { PurgeManager } from '../../logic/PurgeManager';
import { Utilities } from '../../utilities/Utilities';
import { VersionMismatchFinder } from '../../api/VersionMismatchFinder';

export class AddAction extends BaseRushAction {
  private _exactFlag: CommandLineFlagParameter;
  private _caretFlag: CommandLineFlagParameter;
  private _devDependencyFlag: CommandLineFlagParameter;
  private _makeConsistentFlag: CommandLineFlagParameter;
  private _noInstallFlag: CommandLineFlagParameter;
  private _packageName: CommandLineStringParameter;
  private _versionSpecifier: CommandLineStringParameter;

  constructor(parser: RushCommandLineParser) {
    const documentation: string[] = [
      'Blah.'
    ];
    super({
      actionName: 'add',
      summary: 'Adds a dependency to the package.json and runs rush upgrade.',
      documentation: documentation.join(os.EOL),
      safeForSimultaneousRushProcesses: false,
      parser
    });
  }

  public onDefineParameters(): void {
    this._packageName = this.defineStringParameter({
      parameterLongName: '--package',
      parameterShortName: '-p',
      required: true,
      argumentName: 'PACKAGE_NAME',
      description: '(Required) The name of the package which should be added as a dependency'
    });
    this._versionSpecifier = this.defineStringParameter({
      parameterLongName: '--version',
      parameterShortName: '-v',
      argumentName: 'VERSION_RANGE',
      description: ''
    });
    this._exactFlag = this.defineFlagParameter({
      parameterLongName: '--exact',
      description: 'If specified, the version specifier inserted into the'
        + ' package.json will be a locked, exact version.'
    });
    this._caretFlag = this.defineFlagParameter({
      parameterLongName: '--caret',
      description: 'If specified, the version specifier inserted into the'
        + ' package.json will be a prepended with a "caret" specifier ("^").'
    });
    this._devDependencyFlag = this.defineFlagParameter({
      parameterLongName: '--dev',
      description: 'If specified, the package will be added as a "devDependency"'
        + ' to the package.json'
    });
    this._makeConsistentFlag = this.defineFlagParameter({
      parameterLongName: '--make-consistent',
      parameterShortName: '-c',
      description: 'If specified, other packages with this dependency will have their package.json'
        + ' files updated to point at the specified depdendency'
    });
    this._noInstallFlag = this.defineFlagParameter({
      parameterLongName: '--no-install',
      parameterShortName: '-n',
      description: 'If specified, the "rush update" command will not be run after updating the'
        + ' package.json files.'
    });
  }

  public run(): Promise<void> {
    const project: RushConfigurationProject | undefined
      = this.rushConfiguration.getCurrentProjectFromPath(process.cwd());

    if (!project) {
      return Promise.reject(new Error('Not currently in a project folder'));
    }

    if (this._caretFlag.value && this._exactFlag.value) {
      return Promise.reject(new Error('Only one of --caret and --exact should be specified'));
    }

    const packageName: string = this._packageName.value!;
    const initialVersion: string | undefined = this._versionSpecifier.value;

    const implicitlyPinned: Map<string, string>
      = InstallManager.collectImplicitlyPreferredVersions(this.rushConfiguration);

    console.log(`implicitlyPinned size: ${implicitlyPinned.size}`);

    const version: string = this._getNormalizedVersionSpec(
      packageName, initialVersion, implicitlyPinned.get(packageName));

    if (this._devDependencyFlag.value) {
      project.packageJson.devDependencies
        = this._updateDependency(project.packageJson.devDependencies, packageName, version);
    } else {
      project.packageJson.dependencies
        = this._updateDependency(project.packageJson.dependencies, packageName, version);
    }

    if (this.rushConfiguration.enforceConsistentVersions) {
      // we need to do a mismatch check
      const mismatchFinder: VersionMismatchFinder = VersionMismatchFinder.getMismatches(this.rushConfiguration);

      const mismatches: Array<string> = mismatchFinder.getMismatches();
      if (mismatches.length) {
        if (!this._makeConsistentFlag.value) {
          return Promise.reject(new Error(`Adding "${packageName}@${version}" to ${project.packageName}`
            + ` causes mismatched dependencies. Use the --make-consistent flag to update other packages to use this`
            + ` version, or do not specify the --version flag.`));
        }

        // otherwise we need to go update a bunch of other projects
        for (const mismatchedVersion of mismatchFinder.getVersionsOfMismatch(packageName)!) {
          for (const consumer of mismatchFinder.getConsumersOfMismatch(packageName, mismatchedVersion)!) {
            if (packageName !== project.packageName) {
              const consumerProject: RushConfigurationProject = this.rushConfiguration.getProjectByName(consumer)!;

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
    JsonFile.save(project.packageJson, path.join(project.projectFolder, FileConstants.PackageJson));

    if (this._noInstallFlag.value) {
      return Promise.resolve();
    }

    const purgeManager: PurgeManager = new PurgeManager(this.rushConfiguration);
    const installManager: InstallManager = new InstallManager(this.rushConfiguration, purgeManager);
    const installManagerOptions: IInstallManagerOptions = {
      debug: this.parser.isDebug,
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
    implicitlyPinnedVersion: string | undefined): string {
    console.log(`_getNormalizedVersionSpec()`);
    console.log(`packageName: ${packageName}`);
    console.log(`initialSpec: ${initialSpec}`);
    console.log(`implicitlyPinnedVersion: ${implicitlyPinnedVersion}`);

    // if ensureConsistentVersions => reuse the pinned version
    // else, query the registry and use the latest that satisfies semver spec
    if (initialSpec && implicitlyPinnedVersion && initialSpec === implicitlyPinnedVersion) {
      return initialSpec;
    }

    if (this.rushConfiguration.enforceConsistentVersions && !initialSpec && implicitlyPinnedVersion) {
      return implicitlyPinnedVersion;
    }

    let selectedVersion: string | undefined;

    if (initialSpec && initialSpec !== 'latest') {
      const allVersions: string =
        Utilities.executeCommandAndCaptureOutput(this.rushConfiguration.packageManagerToolFilename,
          ['view', packageName, 'versions', '--json'],
          this.rushConfiguration.commonTempFolder);

      let versionList: Array<string> = JSON.parse(allVersions);
      versionList = versionList.sort((a: string, b: string) => { return semver.gt(a, b) ? -1 : 1; });

      for (const version of versionList) {
        if (semver.satisfies(version, initialSpec)) {
          selectedVersion = version;
          break;
        }
      }
      if (!selectedVersion) {
        throw new Error(`Cannot find version for ${packageName} that satisfies "${initialSpec}"`);
      }
    } else {
        selectedVersion = Utilities.executeCommandAndCaptureOutput(this.rushConfiguration.packageManagerToolFilename,
          ['view', `${packageName}@latest`, 'version'],
          this.rushConfiguration.commonTempFolder).trim();
    }

    if (this._caretFlag.value) {
      return '^' + selectedVersion;
    } else if (this._exactFlag.value) {
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
