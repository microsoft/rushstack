// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { EOL } from 'os';

import {
  CommandLineFlagParameter,
  CommandLineStringParameter
} from '@microsoft/ts-command-line';
import {
  IPackageJson
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
      this._versionManager.ensure(this._versionPolicy.value, true);

      const updatedPackages: Map<string, IPackageJson> = this._versionManager.updatedProjects;
      if (updatedPackages.size > 0) {
        console.log(`${updatedPackages.size} packages are getting updated.`);
        this._gitProcess(tempBranch);
      }
    } else if (this._bumpVersion.value) {
      const tempBranch: string = 'version/bump-' + new Date().getTime();
      this._versionManager.bump(this._versionPolicy.value, true);
      this._gitProcess(tempBranch);
    }
  }

  private _gitProcess(tempBranch: string): void {
    const git: Git = new Git(this._targetBranch.value);

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
