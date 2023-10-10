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

  public checkout(branchName: string | undefined, createBranch: boolean = false): void {
    const params: string[] = ['checkout'];
    if (createBranch) {
      params.push('-b');
    }

    params.push(branchName || DUMMY_BRANCH_NAME);

    PublishUtilities.execCommand(!!this._targetBranch, this._gitPath, params);
  }

  public merge(branchName: string, verify: boolean = false): void {
    PublishUtilities.execCommand(!!this._targetBranch, this._gitPath, [
      'merge',
      branchName,
      '--no-edit',
      ...(verify ? [] : ['--no-verify'])
    ]);
  }

  public deleteBranch(
    branchName: string | undefined,
    hasRemote: boolean = true,
    verify: boolean = false
  ): void {
    if (!branchName) {
      branchName = DUMMY_BRANCH_NAME;
    }

    PublishUtilities.execCommand(!!this._targetBranch, this._gitPath, ['branch', '-d', branchName]);
    if (hasRemote) {
      PublishUtilities.execCommand(!!this._targetBranch, this._gitPath, [
        'push',
        'origin',
        '--delete',
        branchName,
        ...(verify ? [] : ['--no-verify'])
      ]);
    }
  }

  public pull(verify: boolean = false): void {
    const params: string[] = ['pull', 'origin'];
    if (this._targetBranch) {
      params.push(this._targetBranch);
    }
    if (!verify) {
      params.push('--no-verify');
    }

    PublishUtilities.execCommand(!!this._targetBranch, this._gitPath, params);
  }

  public fetch(): void {
    PublishUtilities.execCommand(!!this._targetBranch, this._gitPath, ['fetch', 'origin']);
  }

  public addChanges(pathspec?: string, workingDirectory?: string): void {
    const files: string = pathspec ? pathspec : '.';
    PublishUtilities.execCommand(
      !!this._targetBranch,
      this._gitPath,
      ['add', files],
      workingDirectory ? workingDirectory : process.cwd()
    );
  }

  public addTag(
    shouldExecute: boolean,
    packageName: string,
    packageVersion: string,
    commitId: string | undefined,
    preReleaseName?: string
  ): void {
    // Tagging only happens if we're publishing to real NPM and committing to git.
    const tagName: string = PublishUtilities.createTagname(
      packageName,
      packageVersion,
      this._gitTagSeparator
    );
    PublishUtilities.execCommand(!!this._targetBranch && shouldExecute, this._gitPath, [
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

  public hasTag(packageConfig: RushConfigurationProject): boolean {
    const tagName: string = PublishUtilities.createTagname(
      packageConfig.packageName,
      packageConfig.packageJson.version,
      this._gitTagSeparator
    );
    const tagOutput: string = Utilities.executeCommandAndCaptureOutput(
      this._gitPath,
      ['tag', '-l', tagName],
      packageConfig.projectFolder,
      PublishUtilities.getEnvArgs(),
      true
    ).replace(/(\r\n|\n|\r)/gm, '');

    return tagOutput === tagName;
  }

  public commit(commitMessage: string, verify: boolean = false): void {
    PublishUtilities.execCommand(!!this._targetBranch, this._gitPath, [
      'commit',
      '-m',
      commitMessage,
      ...(verify ? [] : ['--no-verify'])
    ]);
  }

  public push(branchName: string | undefined, verify: boolean = false): void {
    PublishUtilities.execCommand(
      !!this._targetBranch,
      this._gitPath,
      // We append "--no-verify" to prevent Git hooks from running.  For example, people may
      // want to invoke "rush change -v" as a pre-push hook.
      [
        'push',
        'origin',
        `HEAD:${branchName || DUMMY_BRANCH_NAME}`,
        '--follow-tags',
        '--verbose',
        ...(verify ? [] : ['--no-verify'])
      ]
    );
  }
}
