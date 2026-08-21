// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { PublishUtilities } from './PublishUtilities';
import { Utilities } from '../utilities/Utilities';
import type { RushConfigurationProject } from '../api/RushConfigurationProject';
import type { Git } from './Git';

const DUMMY_BRANCH_NAME: string = '-branch-name-';

export class PublishGit {
  readonly #targetBranch: string | undefined;
  readonly #gitPath: string;
  readonly #gitTagSeparator: string;

  public constructor(git: Git, targetBranch: string | undefined) {
    this.#targetBranch = targetBranch;
    this.#gitPath = git.getGitPathOrThrow();
    this.#gitTagSeparator = git.getTagSeparator();
  }

  public async checkoutAsync(branchName: string | undefined, createBranch: boolean = false): Promise<void> {
    const args: string[] = ['checkout'];
    if (createBranch) {
      args.push('-b');
    }

    args.push(branchName || DUMMY_BRANCH_NAME);

    await PublishUtilities.execCommandAsync({
      shouldExecute: !!this.#targetBranch,
      command: this.#gitPath,
      args
    });
  }

  public async mergeAsync(branchName: string, verify: boolean = false): Promise<void> {
    await PublishUtilities.execCommandAsync({
      shouldExecute: !!this.#targetBranch,
      command: this.#gitPath,
      args: ['merge', branchName, '--no-edit', ...(verify ? [] : ['--no-verify'])]
    });
  }

  public async deleteBranchAsync(
    branchName: string | undefined,
    hasRemote: boolean = true,
    verify: boolean = false
  ): Promise<void> {
    if (!branchName) {
      branchName = DUMMY_BRANCH_NAME;
    }

    await PublishUtilities.execCommandAsync({
      shouldExecute: !!this.#targetBranch,
      command: this.#gitPath,
      args: ['branch', '-d', branchName]
    });
    if (hasRemote) {
      await PublishUtilities.execCommandAsync({
        shouldExecute: !!this.#targetBranch,
        command: this.#gitPath,
        args: ['push', 'origin', '--delete', branchName, ...(verify ? [] : ['--no-verify'])]
      });
    }
  }

  public async pullAsync(verify: boolean = false): Promise<void> {
    const args: string[] = ['pull', 'origin'];
    if (this.#targetBranch) {
      args.push(this.#targetBranch);
    }
    if (!verify) {
      args.push('--no-verify');
    }

    await PublishUtilities.execCommandAsync({
      shouldExecute: !!this.#targetBranch,
      command: this.#gitPath,
      args
    });
  }

  public async fetchAsync(): Promise<void> {
    await PublishUtilities.execCommandAsync({
      shouldExecute: !!this.#targetBranch,
      command: this.#gitPath,
      args: ['fetch', 'origin']
    });
  }

  public async addChangesAsync(pathspec?: string, workingDirectory?: string): Promise<void> {
    const files: string = pathspec || '.';
    await PublishUtilities.execCommandAsync({
      shouldExecute: !!this.#targetBranch,
      command: this.#gitPath,
      args: ['add', files],
      workingDirectory
    });
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
      this.#gitTagSeparator
    );
    await PublishUtilities.execCommandAsync({
      shouldExecute: !!this.#targetBranch && shouldExecute,
      command: this.#gitPath,
      args: [
        'tag',
        '-a',
        preReleaseName ? `${tagName}-${preReleaseName}` : tagName,
        '-m',
        preReleaseName
          ? `${packageName} v${packageVersion}-${preReleaseName}`
          : `${packageName} v${packageVersion}`,
        ...(commitId ? [commitId] : [])
      ]
    });
  }

  public async hasTagAsync(packageConfig: RushConfigurationProject): Promise<boolean> {
    const tagName: string = PublishUtilities.createTagname(
      packageConfig.packageName,
      packageConfig.packageJson.version,
      this.#gitTagSeparator
    );
    const tagOutput: string = (
      await Utilities.executeCommandAndCaptureOutputAsync({
        command: this.#gitPath,
        args: ['tag', '-l', tagName],
        workingDirectory: packageConfig.projectFolder,
        environment: PublishUtilities.getEnvArgs(),
        keepEnvironment: true
      })
    ).replace(/(\r\n|\n|\r)/gm, '');

    return tagOutput === tagName;
  }

  public async commitAsync(commitMessage: string, verify: boolean = false): Promise<void> {
    await PublishUtilities.execCommandAsync({
      shouldExecute: !!this.#targetBranch,
      command: this.#gitPath,
      args: ['commit', '-m', commitMessage, ...(verify ? [] : ['--no-verify'])]
    });
  }

  public async pushAsync(
    branchName: string | undefined,
    verify: boolean = false,
    followTags: boolean = true
  ): Promise<void> {
    await PublishUtilities.execCommandAsync({
      shouldExecute: !!this.#targetBranch,
      command: this.#gitPath,
      // We append "--no-verify" to prevent Git hooks from running.  For example, people may
      // want to invoke "rush change -v" as a pre-push hook.
      args: [
        'push',
        'origin',
        `HEAD:${branchName || DUMMY_BRANCH_NAME}`,
        ...(followTags ? ['--follow-tags'] : []),
        '--verbose',
        ...(verify ? [] : ['--no-verify'])
      ]
    });
  }
}
