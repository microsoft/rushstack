// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { EOL } from 'os';

import {
  CommandLineFlagParameter,
  CommandLineStringParameter
} from '@microsoft/ts-command-line';
import {
  BumpType,
  IPackageJson,
  VersionControl
} from '@microsoft/rush-lib';

import RushCommandLineParser from './RushCommandLineParser';
import GitPolicy from '../utilities/GitPolicy';
import { BaseRushAction } from './BaseRushAction';
import { VersionManager } from '../utilities/VersionManager';
import { Git } from '../utilities/Git';

export default class VersionAction extends BaseRushAction {
  private _parser: RushCommandLineParser;
  private _ensureVersionPolicy: CommandLineFlagParameter;
  private _bumpVersion: CommandLineFlagParameter;
  private _versionPolicy: CommandLineStringParameter;
  private _bypassPolicy: CommandLineFlagParameter;
  private _targetBranch: CommandLineStringParameter;
  private _overwriteBump: CommandLineStringParameter;
  private _prereleaseIdentifier: CommandLineStringParameter;

  private _versionManager: VersionManager;

  constructor(parser: RushCommandLineParser) {
    super({
      actionVerb: 'version',
      summary: '(EXPERIMENTAL) Manage package versions in the repo.',
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
    this._overwriteBump = this.defineStringParameter({
      parameterLongName: '--override-bump',
      description: 'Overrides the bump type in the version-policy.json for the specifiedd version policy.' +
        'Valid values include: prerelease, patch, preminor, minor, major. ' +
        'The setting only works for lock-step version policy in bump action.'
    });
    this._prereleaseIdentifier = this.defineStringParameter({
      parameterLongName: '--override-prerelease-id',
      description: 'Overrides the prerelease identifier in the version value of version-policy.json ' +
        'for the specified version policy. ' +
        'The setting only works for lock-step version policy in bump action.'
    });
  }

  protected run(): void {
    if (!this._bypassPolicy.value) {
      if (!GitPolicy.check(this.rushConfiguration)) {
        process.exit(1);
        return;
      }
    }

    this._versionManager = new VersionManager(this.rushConfiguration);
    if (this._ensureVersionPolicy.value) {
      const tempBranch: string = 'version/ensure-' + new Date().getTime();
      this._versionManager.ensure(this._versionPolicy.value, true);

      const updatedPackages: Map<string, IPackageJson> = this._versionManager.updatedProjects;
      if (updatedPackages.size > 0) {
        console.log(`${updatedPackages.size} packages are getting updated.`);
        this._gitProcess(tempBranch);
      }
    } else if (this._bumpVersion.value) {
      const tempBranch: string = 'version/bump-' + new Date().getTime();
      this._versionManager.bump(this._versionPolicy.value,
        BumpType[this._overwriteBump.value],
        this._prereleaseIdentifier.value,
        true);
      this._gitProcess(tempBranch);
    }
  }

  private _gitProcess(tempBranch: string): void {
    const git: Git = new Git(this._targetBranch.value);

    // Make changes in temp branch.
    git.checkout(tempBranch, true);

    // Stage, commit, and push the changes to remote temp branch.
    // Need to commit the change log updates in its own commit
    const changeLogUpdated: boolean = VersionControl.getUncommittedChanges().some((changePath) => {
      return changePath.indexOf('CHANGELOG.json') > 0;
    });

    if (changeLogUpdated) {
      git.addChanges('**/CHANGELOG.json');
      git.addChanges('**/CHANGELOG.md');
      git.commit('Updating change logs for package updates.');
    }

    // Commit the package.json and change files updates.
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
