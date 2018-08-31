// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import gitInfo = require('git-repo-info');
import * as child_process from 'child_process';
import * as os from 'os';

import { Utilities } from '../utilities/Utilities';
import { AlreadyReportedError } from '../utilities/AlreadyReportedError';
import { GitEmailPolicy } from './policy/GitEmailPolicy';
import { RushConfiguration } from '../api/RushConfiguration';

interface IResultOrError<TResult> {
  error?: Error;
  result?: TResult;
}

export class Git {
  private static _hasGit: boolean | undefined = undefined;
  private static _gitPath: string | undefined;

  /**
   * Returns the path to the git binary if git is found. If git can't be found, return undefined.
   */
  public static getGitPath(): string | undefined {
    if (Git._hasGit === undefined) {
      const command: string = process.platform === 'win32' ? 'where' : 'which';
      const result: child_process.SpawnSyncReturns<string> = child_process.spawnSync(command, ['git']);

      if (result.status === 0) {
        Git._gitPath = result.stdout;
        Git._hasGit = !!result.stdout;
      }
    }

    return Git._gitPath;
  }

  public static isGitPresent(): boolean {
    return !!Git.getGitPath();
  }

  /**
   * Checks if git is supported and if the current path is under a git working tree.
   */
  public static isPathUnderGitWorkingTree(): boolean {
    if (Git.isGitPresent()) { // Do we even have a git binary?
      try {
        return !!gitInfo().sha;
      } catch (e) {
        return false; // Unexpected, but possible if the .git directory is corrupted.
      }
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
          ''
        ].join(os.EOL)
      );
      throw new AlreadyReportedError();
    }

    if (emailResult.result === undefined || emailResult.result.length === 0) {
      console.log([
        'This operation requires that a git email be specified.',
        '',
        `If you didn't configure your email yet, try something like this:`,
        '',
        ...GitEmailPolicy.getEmailExampleLines(rushConfiguration),
        ''
      ].join(os.EOL));
      throw new AlreadyReportedError();
    }

    return emailResult.result;
  }

  private static _tryGetGitEmail(): IResultOrError<string> {
    const gitPath: string | undefined = Git.getGitPath();
    if (!gitPath) {
      return {
        error: new Error('Git isn\'t present on the path')
      };
    }

    try {
      return {
        result: Utilities.executeCommandAndCaptureOutput(
          'git',
          ['config', 'user.email'],
          '.'
        ).trim()
      };
    } catch (e) {
      return {
        error: e
      };
    }
  }
}
