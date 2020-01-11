// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { PublishUtilities } from './PublishUtilities';
import { Utilities } from '../utilities/Utilities';
import { RushConfigurationProject } from '../api/RushConfigurationProject';

export class PublishGit {
  private _targetBranch: string | undefined;

  public constructor(targetBranch: string | undefined) {

    this._targetBranch = targetBranch;
  }

  public checkout(branchName: string | undefined, createBranch?: boolean): void {
    const params: string = `checkout ${createBranch ? '-b ' : ''}${branchName}`;

    PublishUtilities.execCommand(!!this._targetBranch, 'git', params.split(' '));
  }

  public merge(branchName: string): void {
    PublishUtilities.execCommand(!!this._targetBranch, 'git', `merge ${branchName} --no-edit`.split(' '));
  }

  public deleteBranch(branchName: string, hasRemote: boolean = true): void {
    PublishUtilities.execCommand(!!this._targetBranch, 'git', `branch -d ${branchName}`.split(' '));
    if (hasRemote) {
      PublishUtilities.execCommand(!!this._targetBranch, 'git', `push origin --delete ${branchName}`.split(' '));
    }
  }

  public pull(): void {
    PublishUtilities.execCommand(!!this._targetBranch, 'git', `pull origin ${this._targetBranch}`.split(' '));
  }

  public fetch(): void {
    PublishUtilities.execCommand(!!this._targetBranch, 'git', ['fetch', 'origin']);
  }

  public addChanges(pathspec?: string, workingDirectory?: string): void {
    const files: string = pathspec ? pathspec : '.';
    PublishUtilities.execCommand(!!this._targetBranch, 'git', ['add', files],
      workingDirectory ? workingDirectory : process.cwd());
  }

  public addTag(shouldExecute: boolean, packageName: string, packageVersion: string, commitId: string | undefined): void {
    // Tagging only happens if we're publishing to real NPM and committing to git.
    const tagName: string = PublishUtilities.createTagname(packageName, packageVersion);
    PublishUtilities.execCommand(
      !!this._targetBranch && shouldExecute,
      'git',
      ['tag', '-a', tagName, '-m', `"${packageName} v${packageVersion}"`, ...(commitId ? [commitId] : [])]);
  }

  public hasTag(packageConfig: RushConfigurationProject): boolean {
    const tagName: string = PublishUtilities.createTagname(
      packageConfig.packageName,
      packageConfig.packageJson.version
    );
    const tagOutput: string = Utilities.executeCommandAndCaptureOutput(
      'git',
      ['tag', '-l', tagName],
      packageConfig.projectFolder,
      PublishUtilities.getEnvArgs(),
      true
    ).replace(/(\r\n|\n|\r)/gm, '');

    return tagOutput === tagName;
  }

  public commit(commitMessage: string): void {
    PublishUtilities.execCommand(!!this._targetBranch, 'git', ['commit', '-m', commitMessage]);
  }

  public push(branchName: string | undefined): void {
    PublishUtilities.execCommand(
      !!this._targetBranch,
      'git',
      // We append "--no-verify" to prevent Git hooks from running.  For example, people may
      // want to invoke "rush change -v" as a pre-push hook.
      ['push', 'origin', 'HEAD:' + branchName, '--follow-tags', '--verbose', '--no-verify']);
  }
}
