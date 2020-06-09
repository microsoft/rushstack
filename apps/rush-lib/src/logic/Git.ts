// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import gitInfo = require('git-repo-info');
import * as os from 'os';
import * as path from 'path';
import { Executable } from '@rushstack/node-core-library';

import { Utilities } from '../utilities/Utilities';
import { AlreadyReportedError } from '../utilities/AlreadyReportedError';
import { GitEmailPolicy } from './policy/GitEmailPolicy';
import { RushConfiguration } from '../api/RushConfiguration';

interface IResultOrError<TResult> {
  error?: Error;
  result?: TResult;
}

export class Git {
  private static _checkedGitPath: boolean = false;
  private static _gitPath: string | undefined;
  private static _checkedGitInfo: boolean = false;
  private static _gitInfo: gitInfo.GitRepoInfo | undefined;

  private static _gitEmailResult: IResultOrError<string> | undefined = undefined;

  /**
   * Returns the path to the Git binary if found. Otherwise, return undefined.
   */
  public static getGitPath(): string | undefined {
    if (!Git._checkedGitPath) {
      Git._gitPath = Executable.tryResolve('git');
      Git._checkedGitPath = true;
    }

    return Git._gitPath;
  }

  /**
   * Returns true if the Git binary can be found.
   */
  public static isGitPresent(): boolean {
    return !!Git.getGitPath();
  }

  /**
   * Returns true if the Git binary was found and the current path is under a Git working tree.
   * @param repoInfo - If provided, do the check based on this Git repo info. If not provided,
   * the result of `Git.getGitInfo()` is used.
   */
  public static isPathUnderGitWorkingTree(repoInfo?: gitInfo.GitRepoInfo): boolean {
    if (Git.isGitPresent()) {
      // Do we even have a Git binary?
      if (!repoInfo) {
        repoInfo = Git.getGitInfo();
      }
      return !!(repoInfo && repoInfo.sha);
    } else {
      return false;
    }
  }

  /**
   * If a Git email address is configured and is nonempty, this returns it.
   * Otherwise, undefined is returned.
   */
  public static tryGetGitEmail(rushConfiguration: RushConfiguration): string | undefined {
    const emailResult: IResultOrError<string> = Git._tryGetGitEmail();
    if (emailResult.result !== undefined && emailResult.result.length > 0) {
      return emailResult.result;
    }
    return undefined;
  }

  /**
   * If a Git email address is configured and is nonempty, this returns it.
   * Otherwise, configuration instructions are printed to the console,
   * and AlreadyReportedError is thrown.
   */
  public static getGitEmail(rushConfiguration: RushConfiguration): string {
    // Determine the user's account
    // Ex: "bob@example.com"
    const emailResult: IResultOrError<string> = Git._tryGetGitEmail();
    if (emailResult.error) {
      console.log(
        [
          `Error: ${emailResult.error.message}`,
          'Unable to determine your Git configuration using this command:',
          '',
          '    git config user.email',
          '',
        ].join(os.EOL)
      );
      throw new AlreadyReportedError();
    }

    if (emailResult.result === undefined || emailResult.result.length === 0) {
      console.log(
        [
          'This operation requires that a Git email be specified.',
          '',
          `If you didn't configure your email yet, try something like this:`,
          '',
          ...GitEmailPolicy.getEmailExampleLines(rushConfiguration),
          '',
        ].join(os.EOL)
      );
      throw new AlreadyReportedError();
    }

    return emailResult.result;
  }

  /**
   * Get the folder where Git hooks should go for the current working tree.
   * Returns undefined if the current path is not under a Git working tree.
   */
  public static getHooksFolder(): string | undefined {
    const repoInfo: gitInfo.GitRepoInfo | undefined = Git.getGitInfo();
    if (repoInfo && repoInfo.worktreeGitDir) {
      return path.join(repoInfo.worktreeGitDir, 'hooks');
    }
    return undefined;
  }

  /**
   * Get information about the current Git working tree.
   * Returns undefined if the current path is not under a Git working tree.
   */
  public static getGitInfo(): Readonly<gitInfo.GitRepoInfo> | undefined {
    if (!Git._checkedGitInfo) {
      let repoInfo: gitInfo.GitRepoInfo | undefined;
      try {
        // gitInfo() shouldn't usually throw, but wrapping in a try/catch just in case
        repoInfo = gitInfo();
      } catch (ex) {
        // if there's an error, assume we're not in a Git working tree
      }

      if (repoInfo && Git.isPathUnderGitWorkingTree(repoInfo)) {
        Git._gitInfo = repoInfo;
      }
      Git._checkedGitInfo = true;
    }
    return Git._gitInfo;
  }

  private static _tryGetGitEmail(): IResultOrError<string> {
    if (Git._gitEmailResult === undefined) {
      if (!Git.isGitPresent()) {
        Git._gitEmailResult = {
          error: new Error("Git isn't present on the path"),
        };
      } else {
        try {
          Git._gitEmailResult = {
            result: Utilities.executeCommandAndCaptureOutput('git', ['config', 'user.email'], '.').trim(),
          };
        } catch (e) {
          Git._gitEmailResult = {
            error: e,
          };
        }
      }
    }

    return Git._gitEmailResult;
  }
}
