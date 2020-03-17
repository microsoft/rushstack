// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as semver from 'semver';
import {
  IPackageJson,
  FileConstants
} from '@rushstack/node-core-library';
import {
  CommandLineFlagParameter,
  CommandLineStringParameter
} from '@rushstack/ts-command-line';

import { BumpType, LockStepVersionPolicy } from '../../api/VersionPolicy';
import { VersionPolicyConfiguration } from '../../api/VersionPolicyConfiguration';
import { RushConfiguration } from '../../api/RushConfiguration';
import { VersionControl } from '../../utilities/VersionControl';
import { VersionMismatchFinder } from '../../logic/versionMismatch/VersionMismatchFinder';
import { RushCommandLineParser } from '../RushCommandLineParser';
import { PolicyValidator } from '../../logic/policy/PolicyValidator';
import { BaseRushAction } from './BaseRushAction';
import { VersionManager } from '../../logic/VersionManager';
import { PublishGit } from '../../logic/PublishGit';
import { Git } from '../../logic/Git';

export const DEFAULT_PACKAGE_UPDATE_MESSAGE: string = 'Applying package updates.';

export class VersionAction extends BaseRushAction {
  private _ensureVersionPolicy: CommandLineFlagParameter;
  private _overrideVersion: CommandLineStringParameter;
  private _bumpVersion: CommandLineFlagParameter;
  private _versionPolicy: CommandLineStringParameter;
  private _bypassPolicy: CommandLineFlagParameter;
  private _targetBranch: CommandLineStringParameter;
  private _overwriteBump: CommandLineStringParameter;
  private _prereleaseIdentifier: CommandLineStringParameter;

  private _versionManager: VersionManager;

  public constructor(parser: RushCommandLineParser) {
    super({
      actionName: 'version',
      summary: '(EXPERIMENTAL) Manage package versions in the repo.',
      documentation: '(EXPERIMENTAL) use this "rush version" command to ensure version policies and bump versions.',
      parser
    });
  }

  protected onDefineParameters(): void {
    this._targetBranch = this.defineStringParameter({
      parameterLongName: '--target-branch',
      parameterShortName: '-b',
      argumentName: 'BRANCH',
      description:
      'If this flag is specified, changes will be committed and merged into the target branch.'
    });
    this._ensureVersionPolicy = this.defineFlagParameter({
      parameterLongName: '--ensure-version-policy',
      description: 'Updates package versions if needed to satisfy version policies.'
    });
    this._overrideVersion = this.defineStringParameter({
      parameterLongName: '--override-version',
      argumentName: 'NEW_VERSION',
      description: 'Override the version in the specified --version-policy. ' +
        'This setting only works for lock-step version policy and when --ensure-version-policy is specified.'
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
      argumentName: 'POLICY',
      description: 'The name of the version policy'
    });
    this._overwriteBump = this.defineStringParameter({
      parameterLongName: '--override-bump',
      argumentName: 'BUMPTYPE',
      description: 'Overrides the bump type in the version-policy.json for the specified version policy.' +
        'Valid BUMPTYPE values include: prerelease, patch, preminor, minor, major. ' +
        'This setting only works for lock-step version policy in bump action.'
    });
    this._prereleaseIdentifier = this.defineStringParameter({
      parameterLongName: '--override-prerelease-id',
      argumentName: 'ID',
      description: 'Overrides the prerelease identifier in the version value of version-policy.json ' +
        'for the specified version policy. ' +
        'This setting only works for lock-step version policy. ' +
        'This setting increases to new prerelease id when "--bump" is provided but only replaces the ' +
        'prerelease name when "--ensure-version-policy" is provided.'
    });
  }

  protected run(): Promise<void> {
    return Promise.resolve().then(() => {
      PolicyValidator.validatePolicy(this.rushConfiguration, this._bypassPolicy.value);
      const userEmail: string = Git.getGitEmail(this.rushConfiguration);

      this._validateInput();

      this._versionManager = new VersionManager(this.rushConfiguration, userEmail);

      if (this._ensureVersionPolicy.value) {
        this._overwritePolicyVersionIfNeeded();
        const tempBranch: string = 'version/ensure-' + new Date().getTime();
        this._versionManager.ensure(this._versionPolicy.value, true,
          !!this._overrideVersion.value || !!this._prereleaseIdentifier.value);

        const updatedPackages: Map<string, IPackageJson> = this._versionManager.updatedProjects;
        if (updatedPackages.size > 0) {
          console.log(`${updatedPackages.size} packages are getting updated.`);
          this._gitProcess(tempBranch);
        }
      } else if (this._bumpVersion.value) {
        const tempBranch: string = 'version/bump-' + new Date().getTime();
        this._versionManager.bump(this._versionPolicy.value,
          this._overwriteBump.value ? BumpType[this._overwriteBump.value] : undefined,
          this._prereleaseIdentifier.value,
          true);
        this._gitProcess(tempBranch);
      }
    });
  }

  private _overwritePolicyVersionIfNeeded(): void {
    if (!this._overrideVersion.value && !this._prereleaseIdentifier.value) {
      // No need to overwrite policy version
      return;
    }
    if (this._overrideVersion.value && this._prereleaseIdentifier.value) {
      throw new Error(`The parameters "--override-version" and` +
        ` "--override-prerelease-id" cannot be used together.`);
    }

    if (this._versionPolicy.value) {
      const versionConfig: VersionPolicyConfiguration = this.rushConfiguration.versionPolicyConfiguration;
      const policy: LockStepVersionPolicy = versionConfig.getVersionPolicy(this._versionPolicy.value) as
          LockStepVersionPolicy;
      if (!policy || !policy.isLockstepped) {
        throw new Error(`The lockstep version policy "${policy.policyName}" is not found.`);
      }
      let newVersion: string | undefined = undefined;
      if (this._overrideVersion.value) {
        newVersion = this._overrideVersion.value;
      } else if (this._prereleaseIdentifier.value) {
        const newPolicyVersion: semver.SemVer = new semver.SemVer(policy.version);
        if (newPolicyVersion.prerelease.length) {
          // Update 1.5.0-alpha.10 to 1.5.0-beta.10
          newPolicyVersion.prerelease[0] = this._prereleaseIdentifier.value;
        } else {
          // Update 1.5.0 to 1.5.0-beta
          newPolicyVersion.prerelease.push(this._prereleaseIdentifier.value);
        }
        newVersion = newPolicyVersion.format();
      }

      if (newVersion) {
        console.log(`Update version policy ${policy.policyName} from ${policy.version} to ${newVersion}`);
        versionConfig.update(this._versionPolicy.value, newVersion);
      }
    } else {
      throw new Error('Missing --version-policy parameter to specify which version policy should be overwritten.');
    }
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
    const rushConfig: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
      this.rushConfiguration.rushJsonFile
    );

    const mismatchFinder: VersionMismatchFinder = VersionMismatchFinder.getMismatches(rushConfig);
    if (mismatchFinder.numberOfMismatches) {
      throw new Error('Unable to finish version bump because inconsistencies were encountered.' +
        ' Run \"rush check\" to find more details.');
    }
  }

  private _gitProcess(tempBranch: string): void {
    // Validate the result before commit.
    this._validateResult();

    const git: PublishGit = new PublishGit(this._targetBranch.value);

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
      git.addChanges(':/**/CHANGELOG.json');
      git.addChanges(':/**/CHANGELOG.md');
      git.commit('Deleting change files and updating change logs for package updates.');
    }

    // Commit the package.json and change files updates.
    const packageJsonUpdated: boolean = uncommittedChanges.some((changePath) => {
      return changePath.indexOf(FileConstants.PackageJson) > 0;
    });

    if (packageJsonUpdated) {
      git.addChanges(':/*');
      git.commit(this.rushConfiguration.gitVersionBumpCommitMessage || DEFAULT_PACKAGE_UPDATE_MESSAGE);
    }

    if (changeLogUpdated || packageJsonUpdated) {
      git.push(tempBranch);

      // Now merge to target branch.
      git.fetch();
      git.checkout(this._targetBranch.value);
      git.pull();
      git.merge(tempBranch);
      git.push(this._targetBranch.value);
      git.deleteBranch(tempBranch);
    } else {
      // skip commits
      git.fetch();
      git.checkout(this._targetBranch.value);
      git.deleteBranch(tempBranch, false);
    }
  }
}
