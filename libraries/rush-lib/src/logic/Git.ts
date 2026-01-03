// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type child_process from 'node:child_process';
import * as path from 'node:path';
import * as url from 'node:url';

import gitInfo from 'git-repo-info';
import { trueCasePathSync } from 'true-case-path';

import { Executable, AlreadyReportedError, Path, Async } from '@rushstack/node-core-library';
import { Colorize, type ITerminal } from '@rushstack/terminal';
import { ensureGitMinimumVersion } from '@rushstack/package-deps-hash';

import { Utilities } from '../utilities/Utilities';
import * as GitEmailPolicy from './policy/GitEmailPolicy';
import type { RushConfiguration } from '../api/RushConfiguration';
import { EnvironmentConfiguration } from '../api/EnvironmentConfiguration';
import { type IChangedGitStatusEntry, type IGitStatusEntry, parseGitStatus } from './GitStatusParser';
import { RushConstants } from './RushConstants';

export const DEFAULT_GIT_TAG_SEPARATOR: string = '_';

interface IResultOrError<TResult> {
  error?: Error;
  result?: TResult;
}

export interface IGetBlobOptions {
  blobSpec: string;
  repositoryRoot: string;
}

export class Git {
  private readonly _rushConfiguration: RushConfiguration;
  private _checkedGitPath: boolean = false;
  private _gitPath: string | undefined;
  private _checkedGitInfo: boolean = false;
  private _gitInfo: gitInfo.GitRepoInfo | undefined;

  private _gitEmailResult: IResultOrError<string> | undefined = undefined;
  private _gitHooksPath: IResultOrError<string> | undefined = undefined;

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
   * Otherwise, configuration instructions are printed to the console,
   * and AlreadyReportedError is thrown.
   */
  public async getGitEmailAsync(): Promise<string> {
    // Determine the user's account
    // Ex: "bob@example.com"
    const { error, result } = await this._tryGetGitEmailAsync();
    if (error) {
      // eslint-disable-next-line no-console
      console.log(
        [
          `Error: ${error.message}`,
          'Unable to determine your Git configuration using this command:',
          '',
          '    git config user.email',
          ''
        ].join('\n')
      );
      throw new AlreadyReportedError();
    }
    return this.validateGitEmail(result);
  }

  /**
   * If the Git email address is configured and non-empty, this returns it. Otherwise
   * it prints an error message and throws.
   */
  public validateGitEmail(userEmail: string | undefined): string {
    if (userEmail === undefined || userEmail.length === 0) {
      // eslint-disable-next-line no-console
      console.log(
        [
          'This operation requires that a Git email be specified.',
          '',
          `If you didn't configure your email yet, try something like this:`,
          '',
          ...GitEmailPolicy.getEmailExampleLines(this._rushConfiguration),
          ''
        ].join('\n')
      );
      throw new AlreadyReportedError();
    }

    return userEmail;
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

  public async getIsHooksPathDefaultAsync(): Promise<boolean> {
    const repoInfo: gitInfo.GitRepoInfo | undefined = this.getGitInfo();
    if (!repoInfo?.commonGitDir) {
      // This should have never been called in a non-Git environment
      return true;
    }
    let commonGitDir: string = repoInfo.commonGitDir;
    try {
      commonGitDir = trueCasePathSync(commonGitDir);
    } catch (error) {
      /* ignore errors from true-case-path */
    }
    const defaultHooksPath: string = path.resolve(commonGitDir, 'hooks');
    const hooksResult: IResultOrError<string> = await this._tryGetGitHooksPathAsync();
    if (hooksResult.error) {
      // eslint-disable-next-line no-console
      console.log(
        [
          `Error: ${hooksResult.error.message}`,
          'Unable to determine your Git configuration using this command:',
          '',
          '    git rev-parse --git-path hooks',
          '',
          'Assuming hooks can still be installed in the default location'
        ].join('\n')
      );
      return true;
    }

    if (hooksResult.result) {
      const absoluteHooksPath: string = path.resolve(
        this._rushConfiguration.rushJsonFolder,
        hooksResult.result
      );
      return absoluteHooksPath === defaultHooksPath;
    }

    // No error, but also empty result? Not sure it's possible.
    return true;
  }

  public async getConfigHooksPathAsync(): Promise<string> {
    let configHooksPath: string = '';
    const gitPath: string = this.getGitPathOrThrow();
    try {
      configHooksPath = (
        await this._executeGitCommandAndCaptureOutputAsync(gitPath, ['config', 'core.hooksPath'])
      ).trim();
    } catch (e) {
      // git config returns error code 1 if core.hooksPath is not set.
    }
    return configHooksPath;
  }

  /**
   * Get information about the current Git working tree.
   * Returns undefined if rush.json is not under a Git working tree.
   */
  public getGitInfo(): Readonly<gitInfo.GitRepoInfo> | undefined {
    if (!this._checkedGitInfo) {
      let repoInfo: gitInfo.GitRepoInfo | undefined;
      try {
        // gitInfo() shouldn't usually throw, but wrapping in a try/catch just in case
        repoInfo = gitInfo(this._rushConfiguration.rushJsonFolder);
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

  public async getMergeBaseAsync(
    targetBranch: string,
    terminal: ITerminal,
    shouldFetch: boolean = false
  ): Promise<string> {
    if (shouldFetch) {
      this._fetchRemoteBranch(targetBranch, terminal);
    }

    const gitPath: string = this.getGitPathOrThrow();
    try {
      const output: string = await this._executeGitCommandAndCaptureOutputAsync(gitPath, [
        '--no-optional-locks',
        'merge-base',
        '--',
        'HEAD',
        targetBranch
      ]);
      const result: string = output.trim();

      return result;
    } catch (e) {
      terminal.writeErrorLine(
        `Unable to determine merge base for branch "${targetBranch}". ` +
          'This can occur if the current clone is a shallow clone. If this clone is running in a CI ' +
          'pipeline, check your pipeline settings to ensure that the clone depth includes ' +
          'the expected merge base. If this clone is running locally, consider running "git fetch --deepen=<depth>".'
      );
      throw new AlreadyReportedError();
    }
  }

  public async getBlobContentAsync({ blobSpec, repositoryRoot }: IGetBlobOptions): Promise<string> {
    const gitPath: string = this.getGitPathOrThrow();
    const output: string = await this._executeGitCommandAndCaptureOutputAsync(
      gitPath,
      ['cat-file', 'blob', blobSpec, '--'],
      repositoryRoot
    );

    return output;
  }

  /**
   * @param pathPrefix - An optional path prefix "git diff"s should be filtered by.
   * @returns
   * An array of paths of repo-root-relative paths of files that are different from
   * those in the provided {@param targetBranch}. If a {@param pathPrefix} is provided,
   * this function only returns results under the that path.
   */
  public async getChangedFilesAsync(
    targetBranch: string,
    terminal: ITerminal,
    skipFetch: boolean = false,
    pathPrefix?: string
  ): Promise<string[]> {
    if (!skipFetch) {
      this._fetchRemoteBranch(targetBranch, terminal);
    }

    const gitPath: string = this.getGitPathOrThrow();
    const output: string = await this._executeGitCommandAndCaptureOutputAsync(gitPath, [
      'diff',
      `${targetBranch}...`,
      '--name-only',
      '--no-renames',
      '--diff-filter=A'
    ]);
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
   * default branch 'origin/main'.
   * If there are more than one matches, returns the first remote's default branch.
   *
   * @param rushConfiguration - rush configuration
   */
  public async getRemoteDefaultBranchAsync(): Promise<string> {
    const repositoryUrls: string[] = this._rushConfiguration.repositoryUrls;
    if (repositoryUrls.length > 0) {
      const gitPath: string = this.getGitPathOrThrow();
      const output: string = (await this._executeGitCommandAndCaptureOutputAsync(gitPath, ['remote'])).trim();

      const normalizedRepositoryUrls: Set<string> = new Set<string>();
      for (const repositoryUrl of repositoryUrls) {
        // Apply toUpperCase() for a case-insensitive comparison
        normalizedRepositoryUrls.add(Git.normalizeGitUrlForComparison(repositoryUrl).toUpperCase());
      }

      const matchingRemotes: string[] = [];
      await Async.forEachAsync(
        output.split('\n'),
        async (remoteName) => {
          if (remoteName) {
            const remoteUrl: string = (
              await this._executeGitCommandAndCaptureOutputAsync(gitPath, [
                'remote',
                'get-url',
                '--',
                remoteName
              ])
            ).trim();

            if (remoteUrl) {
              // Also apply toUpperCase() for a case-insensitive comparison
              const normalizedRemoteUrl: string = Git.normalizeGitUrlForComparison(remoteUrl).toUpperCase();
              if (normalizedRepositoryUrls.has(normalizedRemoteUrl)) {
                matchingRemotes.push(remoteName);
              }
            }
          }
        },
        { concurrency: 10 }
      );

      if (matchingRemotes.length > 0) {
        if (matchingRemotes.length > 1) {
          // eslint-disable-next-line no-console
          console.log(
            `More than one git remote matches the repository URL. Using the first remote (${matchingRemotes[0]}).`
          );
        }

        return `${matchingRemotes[0]}/${this._rushConfiguration.repositoryDefaultBranch}`;
      } else {
        const errorMessage: string =
          repositoryUrls.length > 1
            ? `Unable to find a git remote matching one of the repository URLs (${repositoryUrls.join(
                ', '
              )}). `
            : `Unable to find a git remote matching the repository URL (${repositoryUrls[0]}). `;
        // eslint-disable-next-line no-console
        console.log(Colorize.yellow(errorMessage + 'Detected changes are likely to be incorrect.'));

        return this._rushConfiguration.repositoryDefaultFullyQualifiedRemoteBranch;
      }
    } else {
      // eslint-disable-next-line no-console
      console.log(
        Colorize.yellow(
          `A git remote URL has not been specified in ${RushConstants.rushJsonFilename}. Setting the baseline remote URL is recommended.`
        )
      );
      return this._rushConfiguration.repositoryDefaultFullyQualifiedRemoteBranch;
    }
  }

  public async hasUncommittedChangesAsync(): Promise<boolean> {
    const gitStatusEntries: Iterable<IGitStatusEntry> = await this.getGitStatusAsync();
    for (const _ of gitStatusEntries) {
      // If there are any changes, return true. We only need to evaluate the first iterator entry
      return true;
    }

    return false;
  }

  public async hasUnstagedChangesAsync(): Promise<boolean> {
    const gitStatusEntries: Iterable<IGitStatusEntry> = await this.getGitStatusAsync();
    for (const gitStatusEntry of gitStatusEntries) {
      if (
        gitStatusEntry.kind === 'untracked' ||
        (gitStatusEntry as IChangedGitStatusEntry).unstagedChangeType !== undefined
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * The list of files changed but not committed
   */
  public async getUncommittedChangesAsync(): Promise<ReadonlyArray<string>> {
    const result: string[] = [];
    const gitStatusEntries: Iterable<IGitStatusEntry> = await this.getGitStatusAsync();
    for (const gitStatusEntry of gitStatusEntries) {
      result.push(gitStatusEntry.path);
    }

    return result;
  }

  public getTagSeparator(): string {
    return this._rushConfiguration.gitTagSeparator || DEFAULT_GIT_TAG_SEPARATOR;
  }

  public async getGitStatusAsync(): Promise<Iterable<IGitStatusEntry>> {
    const gitPath: string = this.getGitPathOrThrow();
    // See Git.test.ts for example output
    const output: string = await this._executeGitCommandAndCaptureOutputAsync(gitPath, [
      'status',
      '--porcelain=2',
      '--null',
      '--ignored=no'
    ]);

    return parseGitStatus(output);
  }

  /**
   * Git remotes can use different URL syntaxes; this converts them all to a normalized HTTPS
   * representation for matching purposes.  IF THE INPUT IS NOT ALREADY HTTPS, THE OUTPUT IS
   * NOT NECESSARILY A VALID GIT URL.
   *
   * @example
   * `git@github.com:ExampleOrg/ExampleProject.git` --> `https://github.com/ExampleOrg/ExampleProject`
   */
  public static normalizeGitUrlForComparison(gitUrl: string): string {
    // Git URL formats are documented here: https://www.git-scm.com/docs/git-clone#_git_urls

    let result: string = gitUrl.trim();

    // [user@]host.xz:path/to/repo.git/
    // "This syntax is only recognized if there are no slashes before the first colon. This helps
    // differentiate a local path that contains a colon."
    //
    // Match patterns like this:
    //   user@host.ext:path/to/repo
    //   host.ext:path/to/repo
    //   localhost:/~user/path/to/repo
    //
    // But not:
    //   http://blah
    //   c:/windows/path.txt
    //
    const scpLikeSyntaxRegExp: RegExp = /^(?:[^@:\/]+\@)?([^:\/]{2,})\:((?!\/\/).+)$/;

    // Example: "user@host.ext:path/to/repo"
    const scpLikeSyntaxMatch: RegExpExecArray | null = scpLikeSyntaxRegExp.exec(gitUrl);
    if (scpLikeSyntaxMatch) {
      // Example: "host.ext"
      const host: string = scpLikeSyntaxMatch[1];
      // Example: "path/to/repo"
      const urlPath: string = scpLikeSyntaxMatch[2];

      if (urlPath.startsWith('/')) {
        result = `https://${host}${urlPath}`;
      } else {
        result = `https://${host}/${urlPath}`;
      }
    }

    const parsedUrl: url.UrlWithStringQuery = url.parse(result);

    // Only convert recognized schemes

    switch (parsedUrl.protocol) {
      case 'http:':
      case 'https:':
      case 'ssh:':
      case 'ftp:':
      case 'ftps:':
      case 'git:':
      case 'git+http:':
      case 'git+https:':
      case 'git+ssh:':
      case 'git+ftp:':
      case 'git+ftps:':
        // Assemble the parts we want:
        result = `https://${parsedUrl.host}${parsedUrl.pathname}`;
        break;
    }

    // Trim ".git" or ".git/" from the end
    result = result.replace(/.git\/?$/, '');
    return result;
  }

  /**
   * This will throw errors only if we cannot find Git commandline.
   * If git email didn't configure, this will return undefined; otherwise,
   * returns user.email config
   */
  public async tryGetGitEmailAsync(): Promise<string | undefined> {
    const { result } = await this._tryGetGitEmailAsync();
    return result;
  }

  public async stageAndCommitGitChangesAsync(
    pattern: string[],
    message: string,
    terminal: ITerminal
  ): Promise<void> {
    try {
      const gitPath: string = this.getGitPathOrThrow();
      await this._executeGitCommandAndCaptureOutputAsync(
        gitPath,
        ['add', '--', ...pattern],
        this._rushConfiguration.changesFolder
      );
      await this._executeGitCommandAndCaptureOutputAsync(
        gitPath,
        ['commit', '-m', message, '--', ...pattern],
        this._rushConfiguration.changesFolder
      );
    } catch (error) {
      terminal.writeErrorLine(`ERROR: Cannot stage and commit git changes ${(error as Error).message}`);
    }
  }

  /**
   * Returns an object containing either the result of the `git config user.email`
   * command or an error.
   */
  private async _tryGetGitEmailAsync(): Promise<IResultOrError<string>> {
    if (this._gitEmailResult === undefined) {
      const gitPath: string = this.getGitPathOrThrow();
      try {
        this._gitEmailResult = {
          result: (
            await this._executeGitCommandAndCaptureOutputAsync(gitPath, ['config', 'user.email'])
          ).trim()
        };
      } catch (e) {
        this._gitEmailResult = {
          error: e as Error
        };
      }
    }

    return this._gitEmailResult;
  }

  private async _tryGetGitHooksPathAsync(): Promise<IResultOrError<string>> {
    if (this._gitHooksPath === undefined) {
      const gitPath: string = this.getGitPathOrThrow();
      try {
        this._gitHooksPath = {
          result: (
            await this._executeGitCommandAndCaptureOutputAsync(gitPath, ['rev-parse', '--git-path', 'hooks'])
          ).trim()
        };
      } catch (e) {
        this._gitHooksPath = {
          error: e as Error
        };
      }
    }

    return this._gitHooksPath;
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
      ['fetch', '--', remoteName, branchName],
      {
        stdio: 'ignore'
      }
    );
    return spawnResult.status === 0;
  }

  private _fetchRemoteBranch(remoteBranchName: string, terminal: ITerminal): void {
    // eslint-disable-next-line no-console
    console.log(`Checking for updates to ${remoteBranchName}...`);
    const fetchResult: boolean = this._tryFetchRemoteBranch(remoteBranchName);
    if (!fetchResult) {
      terminal.writeWarningLine(
        `Error fetching git remote branch ${remoteBranchName}. Detected changed files may be incorrect.`
      );
    }
  }

  /**
   * @internal
   */
  public async _executeGitCommandAndCaptureOutputAsync(
    gitPath: string,
    args: string[],
    workingDirectory: string = this._rushConfiguration.rushJsonFolder
  ): Promise<string> {
    try {
      return await Utilities.executeCommandAndCaptureOutputAsync({
        command: gitPath,
        args,
        workingDirectory
      });
    } catch (e) {
      ensureGitMinimumVersion(gitPath);
      throw e;
    }
  }
  /**
   *
   * @param ref Given a ref which can be branch name, commit hash, tag name, etc, check if it is a commit hash
   */
  public async determineIfRefIsACommitAsync(ref: string): Promise<boolean> {
    const gitPath: string = this.getGitPathOrThrow();
    try {
      const output: string = await this._executeGitCommandAndCaptureOutputAsync(gitPath, [
        'rev-parse',
        '--verify',
        ref
      ]);
      const result: string = output.trim();

      return result === ref;
    } catch (e) {
      // assume not a commit
      return false;
    }
  }
}
