// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import child_process from 'child_process';
import gitInfo = require('git-repo-info');
import * as os from 'os';
import * as path from 'path';
import colors from 'colors';
import { Executable, AlreadyReportedError, Path } from '@rushstack/node-core-library';

import { Utilities } from '../utilities/Utilities';
import { GitEmailPolicy } from './policy/GitEmailPolicy';
import { RushConfiguration } from '../api/RushConfiguration';
import { EnvironmentConfiguration } from '../api/EnvironmentConfiguration';

interface IResultOrError<TResult> {
  error?: Error;
  result?: TResult;
}

export class Git {
  private readonly _rushConfiguration: RushConfiguration;
  private _checkedGitPath: boolean = false;
  private _gitPath: string | undefined;
  private _checkedGitInfo: boolean = false;
  private _gitInfo: gitInfo.GitRepoInfo | undefined;

  private _gitEmailResult: IResultOrError<string> | undefined = undefined;

  public constructor(rushConfiguration: RushConfiguration) {
    this._rushConfiguration = rushConfiguration;
  }

  /**
   * Returns the path to the Git binary if found. Otherwise, return undefined.
   */
  public get gitPath(): string | undefined {
    if (!this._checkedGitPath) {
      this._gitPath = EnvironmentConfiguration.gitBinaryPath || Executable.tryResolve('git');
      this._checkedGitPath = true;
    }

    return this._gitPath;
  }

  public getGitPathOrThrow(): string {
    const gitPath: string | undefined = this.gitPath;
    if (!gitPath) {
      throw new Error('Git is not present');
    } else {
      return gitPath;
    }
  }

  /**
   * Returns true if the Git binary can be found.
   */
  public isGitPresent(): boolean {
    return !!this.gitPath;
  }

  /**
   * Returns true if the Git binary was found and the current path is under a Git working tree.
   * @param repoInfo - If provided, do the check based on this Git repo info. If not provided,
   * the result of `this.getGitInfo()` is used.
   */
  public isPathUnderGitWorkingTree(repoInfo?: gitInfo.GitRepoInfo): boolean {
    if (this.isGitPresent()) {
      // Do we even have a Git binary?
      if (!repoInfo) {
        repoInfo = this.getGitInfo();
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
  public tryGetGitEmail(): string | undefined {
    const emailResult: IResultOrError<string> = this._tryGetGitEmail();
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
  public getGitEmail(): string {
    // Determine the user's account
    // Ex: "bob@example.com"
    const emailResult: IResultOrError<string> = this._tryGetGitEmail();
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
      console.log(
        [
          'This operation requires that a Git email be specified.',
          '',
          `If you didn't configure your email yet, try something like this:`,
          '',
          ...GitEmailPolicy.getEmailExampleLines(this._rushConfiguration),
          ''
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
  public getHooksFolder(): string | undefined {
    const repoInfo: gitInfo.GitRepoInfo | undefined = this.getGitInfo();
    if (repoInfo && repoInfo.worktreeGitDir) {
      return path.join(repoInfo.worktreeGitDir, 'hooks');
    }
    return undefined;
  }

  /**
   * Get information about the current Git working tree.
   * Returns undefined if the current path is not under a Git working tree.
   */
  public getGitInfo(): Readonly<gitInfo.GitRepoInfo> | undefined {
    if (!this._checkedGitInfo) {
      let repoInfo: gitInfo.GitRepoInfo | undefined;
      try {
        // gitInfo() shouldn't usually throw, but wrapping in a try/catch just in case
        repoInfo = gitInfo();
      } catch (ex) {
        // if there's an error, assume we're not in a Git working tree
      }

      if (repoInfo && this.isPathUnderGitWorkingTree(repoInfo)) {
        this._gitInfo = repoInfo;
      }
      this._checkedGitInfo = true;
    }
    return this._gitInfo;
  }

  public getRepositoryRootPath(): string | undefined {
    const gitPath: string = this.getGitPathOrThrow();
    const output: child_process.SpawnSyncReturns<string> = Executable.spawnSync(gitPath, [
      'rev-parse',
      '--show-toplevel'
    ]);

    if (output.status !== 0) {
      return undefined;
    } else {
      return output.stdout.trim();
    }
  }

  public getChangedFolders(targetBranch: string, shouldFetch: boolean = false): string[] | undefined {
    if (shouldFetch) {
      this._fetchRemoteBranch(targetBranch);
    }

    const gitPath: string = this.getGitPathOrThrow();
    const output: string = Utilities.executeCommandAndCaptureOutput(
      gitPath,
      ['diff', `${targetBranch}...`, '--dirstat=files,0'],
      this._rushConfiguration.rushJsonFolder
    );
    const lines: string[] = output.split('\n');
    const result: string[] = [];
    for (const line of lines) {
      if (line) {
        const delimiterIndex: number = line.indexOf('%');
        if (delimiterIndex > 0 && delimiterIndex + 1 < line.length) {
          result.push(line.substring(delimiterIndex + 1).trim());
        }
      }
    }

    return result;
  }

  /**
   * @param pathPrefix - An optional path prefix "git diff"s should be filtered by.
   * @returns
   * An array of paths of repo-root-relative paths of files that are different from
   * those in the provided {@param targetBranch}. If a {@param pathPrefix} is provided,
   * this function only returns results under the that path.
   */
  public getChangedFiles(targetBranch: string, skipFetch: boolean = false, pathPrefix?: string): string[] {
    if (!skipFetch) {
      this._fetchRemoteBranch(targetBranch);
    }

    const gitPath: string = this.getGitPathOrThrow();
    const output: string = Utilities.executeCommandAndCaptureOutput(
      gitPath,
      ['diff', `${targetBranch}...`, '--name-only', '--no-renames', '--diff-filter=A'],
      this._rushConfiguration.rushJsonFolder
    );
    return output
      .split('\n')
      .map((line) => {
        if (line) {
          const trimmedLine: string = line.trim();
          if (!pathPrefix || Path.isUnderOrEqual(trimmedLine, pathPrefix)) {
            return trimmedLine;
          }
        } else {
          return undefined;
        }
      })
      .filter((line) => {
        return line && line.length > 0;
      }) as string[];
  }

  /**
   * Gets the remote default branch that maps to the provided repository url.
   * This method is used by 'Rush change' to find the default remote branch to compare against.
   * If repository url is not provided or if there is no match, returns the default remote's
   * default branch 'origin/master'.
   * If there are more than one matches, returns the first remote's default branch.
   *
   * @param rushConfiguration - rush configuration
   */
  public getRemoteDefaultBranch(): string {
    const repositoryUrl: string | undefined = this._rushConfiguration.repositoryUrl;
    if (repositoryUrl) {
      const gitPath: string = this.getGitPathOrThrow();
      const output: string = Utilities.executeCommandAndCaptureOutput(
        gitPath,
        ['remote'],
        this._rushConfiguration.rushJsonFolder
      ).trim();
      const normalizedRepositoryUrl: string = repositoryUrl.toUpperCase();
      const matchingRemotes: string[] = output.split('\n').filter((remoteName) => {
        if (remoteName) {
          const remoteUrl: string = Utilities.executeCommandAndCaptureOutput(
            gitPath,
            ['remote', 'get-url', remoteName],
            this._rushConfiguration.rushJsonFolder
          ).trim();

          if (!remoteUrl) {
            return false;
          }

          const normalizedRemoteUrl: string = remoteUrl.toUpperCase();
          if (normalizedRemoteUrl.toUpperCase() === normalizedRepositoryUrl) {
            return true;
          }

          // When you copy a URL from the GitHub web site, they append the ".git" file extension to the URL.
          // We allow that to be specified in rush.json, even though the file extension gets dropped
          // by "git clone".
          if (`${normalizedRemoteUrl}.GIT` === normalizedRepositoryUrl) {
            return true;
          }
        }

        return false;
      });

      if (matchingRemotes.length > 0) {
        if (matchingRemotes.length > 1) {
          console.log(
            `More than one git remote matches the repository URL. Using the first remote (${matchingRemotes[0]}).`
          );
        }

        return `${matchingRemotes[0]}/${this._rushConfiguration.repositoryDefaultBranch}`;
      } else {
        console.log(
          colors.yellow(
            `Unable to find a git remote matching the repository URL (${repositoryUrl}). ` +
              'Detected changes are likely to be incorrect.'
          )
        );

        return this._rushConfiguration.repositoryDefaultFullyQualifiedRemoteBranch;
      }
    } else {
      console.log(
        colors.yellow(
          'A git remote URL has not been specified in rush.json. Setting the baseline remote URL is recommended.'
        )
      );
      return this._rushConfiguration.repositoryDefaultFullyQualifiedRemoteBranch;
    }
  }

  public hasUncommittedChanges(): boolean {
    return this.getUncommittedChanges().length > 0;
  }

  /**
   * The list of files changed but not committed
   */
  public getUncommittedChanges(): ReadonlyArray<string> {
    const changes: string[] = [];
    changes.push(...this._getUntrackedChanges());
    changes.push(...this._getDiffOnHEAD());

    return changes.filter((change) => {
      return change.trim().length > 0;
    });
  }

  private _tryGetGitEmail(): IResultOrError<string> {
    if (this._gitEmailResult === undefined) {
      const gitPath: string = this.getGitPathOrThrow();
      try {
        this._gitEmailResult = {
          result: Utilities.executeCommandAndCaptureOutput(
            gitPath,
            ['config', 'user.email'],
            this._rushConfiguration.rushJsonFolder
          ).trim()
        };
      } catch (e) {
        this._gitEmailResult = {
          error: e
        };
      }
    }

    return this._gitEmailResult;
  }

  private _getUntrackedChanges(): string[] {
    const gitPath: string = this.getGitPathOrThrow();
    const output: string = Utilities.executeCommandAndCaptureOutput(
      gitPath,
      ['ls-files', '--exclude-standard', '--others'],
      this._rushConfiguration.rushJsonFolder
    );
    return output.trim().split('\n');
  }

  private _getDiffOnHEAD(): string[] {
    const gitPath: string = this.getGitPathOrThrow();

    const output: string = Utilities.executeCommandAndCaptureOutput(
      gitPath,
      ['diff', 'HEAD', '--name-only'],
      this._rushConfiguration.rushJsonFolder
    );
    return output.trim().split('\n');
  }

  private _tryFetchRemoteBranch(remoteBranchName: string): boolean {
    const firstSlashIndex: number = remoteBranchName.indexOf('/');
    if (firstSlashIndex === -1) {
      throw new Error(
        `Unexpected git remote branch format: ${remoteBranchName}. ` +
          'Expected branch to be in the <remote>/<branch name> format.'
      );
    }

    const remoteName: string = remoteBranchName.substr(0, firstSlashIndex);
    const branchName: string = remoteBranchName.substr(firstSlashIndex + 1);
    const gitPath: string = this.getGitPathOrThrow();
    const spawnResult: child_process.SpawnSyncReturns<string> = Executable.spawnSync(
      gitPath,
      ['fetch', remoteName, branchName],
      {
        stdio: 'ignore'
      }
    );
    return spawnResult.status === 0;
  }

  private _fetchRemoteBranch(remoteBranchName: string): void {
    console.log(`Checking for updates to ${remoteBranchName}...`);
    const fetchResult: boolean = this._tryFetchRemoteBranch(remoteBranchName);
    if (!fetchResult) {
      console.log(
        colors.yellow(
          `Error fetching git remote branch ${remoteBranchName}. Detected changed files may be incorrect.`
        )
      );
    }
  }
}
