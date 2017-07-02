// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { EOL } from 'os';
import * as fsx from 'fs-extra';
import * as path from 'path';
import * as semver from 'semver';

import {
  CommandLineFlagParameter,
  CommandLineStringParameter
} from '@microsoft/ts-command-line';
import {
  IPackageJson,
  IChangeInfo,
  ChangeType,
  RushConfigurationProject
} from '@microsoft/rush-lib';

import RushCommandLineParser from './RushCommandLineParser';
import GitPolicy from '../utilities/GitPolicy';
import { BaseRushAction } from './BaseRushAction';
import { VersionManager } from '../utilities/VersionManager';
import { Git } from '../utilities/Git';
import ChangelogGenerator from '../utilities/ChangelogGenerator';

export default class VersionAction extends BaseRushAction {
  private _parser: RushCommandLineParser;
  private _ensureVersionPolicy: CommandLineFlagParameter;
  private _bumpVersion: CommandLineFlagParameter;
  private _versionPolicy: CommandLineStringParameter;
  private _bypassPolicy: CommandLineFlagParameter;
  private _targetBranch: CommandLineStringParameter;
  private _versionManager: VersionManager;

  constructor(parser: RushCommandLineParser) {
    super({
      actionVerb: 'version',
      summary: 'Manage package versions in the repo.',
      documentation: 'use this "rush version" command to ensure version policies and bump versions.'
    });
    this._parser = parser;
  }

  protected onDefineParameters(): void {
    this._targetBranch = this.defineStringParameter({
      parameterLongName: '--target-branch',
      parameterShortName: '-b',
      key: 'BRANCH',
      description:
      'If this flag is specified, changes will be committed and merged into the target branch.'
    });
    this._ensureVersionPolicy = this.defineFlagParameter({
      parameterLongName: '--ensure-version-policy',
      parameterShortName: '-e',
      description: 'Updates package versions if needed to satisfy version policies.'
    });
    this._bumpVersion = this.defineFlagParameter({
      parameterLongName: '--bump',
      description: 'Bumps package version based on version policies.'
    });
    this._bypassPolicy = this.defineFlagParameter({
      parameterLongName: '--bypass-policy',
      description: 'Overrides "gitPolicy" enforcement (use honorably!)'
    });
    this._versionPolicy = this.defineStringParameter({
      parameterLongName: '--version-policy',
      parameterShortName: '-p',
      description: 'The name of the version policy'
    });
  }

  protected run(): void {
    if (!this._bypassPolicy.value) {
      if (!GitPolicy.check(this.rushConfiguration)) {
        process.exit(1);
        return;
      }
    }
    console.log(`Starting "rush version" ${EOL}`);

    this._versionManager = new VersionManager(this.rushConfiguration);
    if (this._ensureVersionPolicy.value) {
      const tempBranch: string = 'version/ensure-' + new Date().getTime();
      const git: Git = new Git(this._targetBranch.value);

      const updatedPackages: Map<string, IPackageJson> = this._versionManager.ensure(this._versionPolicy.value);
      if (updatedPackages) {
        console.log(`${updatedPackages.size} packages are getting updated.`);
        this._updateFiles(updatedPackages);
        // Make changes in temp branch.
        git.checkout(tempBranch, true);

        // Stage, commit, and push the changes to remote temp branch.
        git.addChanges();
        git.commit();
        git.push(tempBranch);

        // Now merge to target branch.
        git.checkout(this._targetBranch.value);
        git.pull();
        git.merge(tempBranch);
        git.push(this._targetBranch.value);
        git.deleteBranch(tempBranch);
      }
    }
  }

  private _updateFiles(updatedPackages: Map<string, IPackageJson>): void {
    updatedPackages.forEach((newPackageJson, packageName) => {
      const rushProject: RushConfigurationProject = this.rushConfiguration.getProjectByName(packageName);
      // Update package.json
      const packagePath: string = path.join(rushProject.projectFolder, 'package.json');
      fsx.writeFileSync(packagePath, JSON.stringify(newPackageJson, undefined, 2), 'utf8');

      if (newPackageJson.version !== rushProject.packageJson.version) {
        // If package version changes, add an entry to changelog
        const change: IChangeInfo = this._createChangeInfo(newPackageJson, rushProject);
        ChangelogGenerator.updateIndividualChangelog(change,
          rushProject.projectFolder,
          true);
      }
      // TODO: if only package dependency changes, add change file.
    });
  }

  private _createChangeInfo(newPackageJson: IPackageJson,
    rushProject: RushConfigurationProject
  ): IChangeInfo {
    const changeType: ChangeType = this._getChangeType(rushProject.packageJson.version,
      newPackageJson.version);
    // TODO: need to absorb all existing change files
    return {
      changeType: changeType,
      newVersion: newPackageJson.version,
      packageName: newPackageJson.name,
      changes: [
        {
          changeType: changeType,
          comment: `Version bump to ${newPackageJson.version}`,
          newVersion: newPackageJson.version,
          packageName: newPackageJson.name
        }
      ]
    };
  }

  private _getChangeType(oldVersionString: string, newVersionString: string): ChangeType {
    const diff: string = semver.diff(oldVersionString, newVersionString);
    let changeType: ChangeType = ChangeType.none;
    if (diff === 'major') {
      changeType = ChangeType.major;
    } else if (diff === 'minor') {
      changeType = ChangeType.minor;
    } else if (diff === 'patch') {
      changeType = ChangeType.patch;
    }
    return changeType;
  }
}
