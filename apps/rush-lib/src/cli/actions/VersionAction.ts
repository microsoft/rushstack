// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  CommandLineFlagParameter,
  CommandLineStringParameter
} from '@microsoft/ts-command-line';

import { BumpType } from '../../data/VersionPolicy';
import IPackageJson from '../../utilities/IPackageJson';
import RushConfiguration from '../../data/RushConfiguration';
import Utilities from '../../utilities/Utilities';
import VersionControl from '../../utilities/VersionControl';
import { VersionMismatchFinder } from '../../data/VersionMismatchFinder';
import RushCommandLineParser from './RushCommandLineParser';
import GitPolicy from '../logic/GitPolicy';
import { BaseRushAction } from './BaseRushAction';
import { VersionManager } from '../logic/VersionManager';
import { Git } from '../logic/Git';

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
      documentation: '(EXPERIMENTAL) use this "rush version" command to ensure version policies and bump versions.'
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
      description: 'Overrides the bump type in the version-policy.json for the specified version policy.' +
        'Valid values include: prerelease, patch, preminor, minor, major. ' +
        'This setting only works for lock-step version policy in bump action.'
    });
    this._prereleaseIdentifier = this.defineStringParameter({
      parameterLongName: '--override-prerelease-id',
      description: 'Overrides the prerelease identifier in the version value of version-policy.json ' +
        'for the specified version policy. ' +
        'This setting only works for lock-step version policy in bump action.'
    });
  }

  protected run(): Promise<void> {
    if (!this._bypassPolicy.value) {
      if (!GitPolicy.check(this.rushConfiguration)) {
        process.exit(1);
        return Promise.resolve();
      }
    }
    this._validateInput();

    this._versionManager = new VersionManager(this.rushConfiguration, this._getUserEmail());
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
    return Promise.resolve();
  }

  private _validateInput(): void {
    if (this._bumpVersion.value && this._ensureVersionPolicy.value) {
      throw new Error('Please choose --bump or --ensure-version-policy but not together.');
    }

    if (this._overwriteBump.value && !BumpType[this._overwriteBump.value]) {
      throw new Error('The value of override-bump is not valid.  ' +
      'Valid values include prerelease, patch, preminor, minor, and major');
    }
  }

  private _validateResult(): void {
    // Load the config from file to avoid using inconsistent in-memory data.
    const rushConfig: RushConfiguration =
      RushConfiguration.loadFromConfigurationFile(this.rushConfiguration.rushJsonFile);
    const mismatchFinder: VersionMismatchFinder = new VersionMismatchFinder(rushConfig.projects);
    if (mismatchFinder.numberOfMismatches) {
      throw new Error('Unable to finish version bump because inconsistencies were encountered.' +
        ' Run \"rush check\" to find more details.');
    }
  }

  private _getUserEmail(): string {
    return Utilities.executeCommandAndCaptureOutput('git',
        ['config', 'user.email'], '.').trim();
  }

  private _gitProcess(tempBranch: string): void {
    // Validate the result before commit.
    this._validateResult();

    const git: Git = new Git(this._targetBranch.value);

    // Make changes in temp branch.
    git.checkout(tempBranch, true);

    const uncommittedChanges: ReadonlyArray<string> = VersionControl.getUncommittedChanges();

    // Stage, commit, and push the changes to remote temp branch.
    // Need to commit the change log updates in its own commit
    const changeLogUpdated: boolean = uncommittedChanges.some((changePath) => {
      return changePath.indexOf('CHANGELOG.json') > 0;
    });

    if (changeLogUpdated) {
      git.addChanges('.', this.rushConfiguration.changesFolder);
      git.addChanges('**/CHANGELOG.json');
      git.addChanges('**/CHANGELOG.md');
      git.commit('Deleting change files and updating change logs for package updates.');
    }

    // Commit the package.json and change files updates.
    const packageJsonUpdated: boolean = uncommittedChanges.some((changePath) => {
      return changePath.indexOf('package.json') > 0;
    });

    if (packageJsonUpdated) {
      git.addChanges();
      git.commit();
    }

    if (changeLogUpdated || packageJsonUpdated) {
      git.push(tempBranch);

      // Now merge to target branch.
      git.checkout(this._targetBranch.value);
      git.pull();
      git.merge(tempBranch);
      git.push(this._targetBranch.value);
      git.deleteBranch(tempBranch);
    } else {
      // skip commits
      git.checkout(this._targetBranch.value);
      git.deleteBranch(tempBranch, false);
    }
  }
}
