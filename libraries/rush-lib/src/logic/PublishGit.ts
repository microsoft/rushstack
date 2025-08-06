// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { PublishUtilities } from './PublishUtilities';
import { Utilities } from '../utilities/Utilities';
import type { RushConfigurationProject } from '../api/RushConfigurationProject';
import type { Git } from './Git';

const DUMMY_BRANCH_NAME: string = '-branch-name-';

export class PublishGit {
  private readonly _targetBranch: string | undefined;
  private readonly _gitPath: string;
  private readonly _gitTagSeparator: string;

  public constructor(git: Git, targetBranch: string | undefined) {
    this._targetBranch = targetBranch;
    this._gitPath = git.getGitPathOrThrow();
    this._gitTagSeparator = git.getTagSeparator();
  }

  public async checkoutAsync(branchName: string | undefined, createBranch: boolean = false): Promise<void> {
    const params: string[] = ['checkout'];
    if (createBranch) {
      params.push('-b');
    }

    params.push(branchName || DUMMY_BRANCH_NAME);

    await PublishUtilities.execCommandAsync(!!this._targetBranch, this._gitPath, params);
  }

  public async mergeAsync(branchName: string, verify: boolean = false): Promise<void> {
    await PublishUtilities.execCommandAsync(!!this._targetBranch, this._gitPath, [
      'merge',
      branchName,
      '--no-edit',
      ...(verify ? [] : ['--no-verify'])
    ]);
  }

  public async deleteBranchAsync(
    branchName: string | undefined,
    hasRemote: boolean = true,
    verify: boolean = false
  ): Promise<void> {
    if (!branchName) {
      branchName = DUMMY_BRANCH_NAME;
    }

    await PublishUtilities.execCommandAsync(!!this._targetBranch, this._gitPath, [
      'branch',
      '-d',
      branchName
    ]);
    if (hasRemote) {
      await PublishUtilities.execCommandAsync(!!this._targetBranch, this._gitPath, [
        'push',
        'origin',
        '--delete',
        branchName,
        ...(verify ? [] : ['--no-verify'])
      ]);
    }
  }

  public async pullAsync(verify: boolean = false): Promise<void> {
    const params: string[] = ['pull', 'origin'];
    if (this._targetBranch) {
      params.push(this._targetBranch);
    }
    if (!verify) {
      params.push('--no-verify');
    }

    await PublishUtilities.execCommandAsync(!!this._targetBranch, this._gitPath, params);
  }

  public async fetchAsync(): Promise<void> {
    await PublishUtilities.execCommandAsync(!!this._targetBranch, this._gitPath, ['fetch', 'origin']);
  }

  public async addChangesAsync(pathspec?: string, workingDirectory?: string): Promise<void> {
    const files: string = pathspec ? pathspec : '.';
    await PublishUtilities.execCommandAsync(
      !!this._targetBranch,
      this._gitPath,
      ['add', files],
      workingDirectory ? workingDirectory : process.cwd()
    );
  }

  public async addTagAsync(
    shouldExecute: boolean,
    packageName: string,
    packageVersion: string,
    commitId: string | undefined,
    preReleaseName?: string
  ): Promise<void> {
    // Tagging only happens if we're publishing to real NPM and committing to git.
    const tagName: string = PublishUtilities.createTagname(
      packageName,
      packageVersion,
      this._gitTagSeparator
    );
    await PublishUtilities.execCommandAsync(!!this._targetBranch && shouldExecute, this._gitPath, [
      'tag',
      '-a',
      preReleaseName ? `${tagName}-${preReleaseName}` : tagName,
      '-m',
      preReleaseName
        ? `${packageName} v${packageVersion}-${preReleaseName}`
        : `${packageName} v${packageVersion}`,
      ...(commitId ? [commitId] : [])
    ]);
  }

  public async hasTagAsync(packageConfig: RushConfigurationProject): Promise<boolean> {
    const tagName: string = PublishUtilities.createTagname(
      packageConfig.packageName,
      packageConfig.packageJson.version,
      this._gitTagSeparator
    );
    const tagOutput: string = (
      await Utilities.executeCommandAndCaptureOutputAsync(
        this._gitPath,
        ['tag', '-l', tagName],
        packageConfig.projectFolder,
        PublishUtilities.getEnvArgs(),
        true
      )
    ).replace(/(\r\n|\n|\r)/gm, '');

    return tagOutput === tagName;
  }

  public async commitAsync(commitMessage: string, verify: boolean = false): Promise<void> {
    await PublishUtilities.execCommandAsync(!!this._targetBranch, this._gitPath, [
      'commit',
      '-m',
      commitMessage,
      ...(verify ? [] : ['--no-verify'])
    ]);
  }

  public async pushAsync(
    branchName: string | undefined,
    verify: boolean = false,
    followTags: boolean = true
  ): Promise<void> {
    await PublishUtilities.execCommandAsync(
      !!this._targetBranch,
      this._gitPath,
      // We append "--no-verify" to prevent Git hooks from running.  For example, people may
      // want to invoke "rush change -v" as a pre-push hook.
      [
        'push',
        'origin',
        `HEAD:${branchName || DUMMY_BRANCH_NAME}`,
        ...(followTags ? ['--follow-tags'] : []),
        '--verbose',
        ...(verify ? [] : ['--no-verify'])
      ]
    );
  }
}
