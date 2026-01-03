// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import type { ChildProcess, SpawnSyncReturns } from 'node:child_process';

import { default as getGitRepoInfo, type GitRepoInfo as IGitRepoInfo } from 'git-repo-info';
import { default as ignore, type Ignore as IIgnoreMatcher } from 'ignore';

import { Executable, FileSystem, InternalError, Path, Text } from '@rushstack/node-core-library';

// Matches lines starting with "#" and whitespace lines
const GITIGNORE_IGNORABLE_LINE_REGEX: RegExp = /^(?:(?:#.*)|(?:\s+))$/;
const UNINITIALIZED: 'UNINITIALIZED' = 'UNINITIALIZED';

export interface IGitVersion {
  major: number;
  minor: number;
  patch: number;
}

export type GitignoreFilterFn = (filePath: string) => boolean;

interface IExecuteGitCommandOptions {
  command: string;
  args?: string[];
  delimiter?: string;
}

export class GitUtilities {
  private readonly _workingDirectory: string;
  private _ignoreMatcherByGitignoreFolder: Map<string, IIgnoreMatcher> | undefined;
  private _gitPath: string | undefined | typeof UNINITIALIZED = UNINITIALIZED;
  private _gitInfo: IGitRepoInfo | undefined | typeof UNINITIALIZED = UNINITIALIZED;
  private _gitVersion: IGitVersion | undefined | typeof UNINITIALIZED = UNINITIALIZED;

  public constructor(workingDirectory: string) {
    this._workingDirectory = path.resolve(process.cwd(), workingDirectory);
  }

  /**
   * Returns the path to the Git binary if found. Otherwise, return undefined.
   */
  public get gitPath(): string | undefined {
    if (this._gitPath === UNINITIALIZED) {
      this._gitPath = Executable.tryResolve('git');
    }
    return this._gitPath;
  }

  /**
   * Get information about the current Git working tree.
   * Returns undefined if the current path is not under a Git working tree.
   */
  public getGitInfo(): Readonly<IGitRepoInfo> | undefined {
    if (this._gitInfo === UNINITIALIZED) {
      let repoInfo: IGitRepoInfo | undefined;
      try {
        // getGitRepoInfo() shouldn't usually throw, but wrapping in a try/catch just in case
        repoInfo = getGitRepoInfo();
      } catch (ex) {
        // if there's an error, assume we're not in a Git working tree
      }
      this._gitInfo = repoInfo && this.isPathUnderGitWorkingTree(repoInfo) ? repoInfo : undefined;
    }
    return this._gitInfo;
  }

  /**
   *  Gets the Git version and returns it.
   */
  public getGitVersion(): IGitVersion | undefined {
    if (this._gitVersion === UNINITIALIZED) {
      if (this.gitPath) {
        const result: SpawnSyncReturns<string> = Executable.spawnSync(this.gitPath, ['version']);
        if (result.status !== 0) {
          throw new Error(
            `While validating the Git installation, the "git version" command failed with ` +
              `status ${result.status}: ${result.stderr}`
          );
        }
        this._gitVersion = this._parseGitVersion(result.stdout);
      } else {
        this._gitVersion = undefined;
      }
    }
    return this._gitVersion;
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
  public isPathUnderGitWorkingTree(repoInfo?: IGitRepoInfo): boolean {
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
   * Returns an asynchronous filter function which can be used to filter out files that are ignored by Git.
   */
  public async tryCreateGitignoreFilterAsync(): Promise<GitignoreFilterFn | undefined> {
    let gitInfo: IGitRepoInfo | undefined;
    if (!this.isGitPresent() || !(gitInfo = this.getGitInfo())?.sha) {
      return;
    }
    const gitRepoRootPath: string = gitInfo.root;
    const ignoreMatcherMap: Map<string, IIgnoreMatcher> = await this._getIgnoreMatchersAsync(gitRepoRootPath);

    const matcherFiltersByMatcher: Map<IIgnoreMatcher, (filePath: string) => boolean> = new Map();
    return (filePath: string) => {
      const matcher: IIgnoreMatcher = this._findIgnoreMatcherForFilePath(filePath, ignoreMatcherMap);
      let matcherFilter: ((filePath: string) => boolean) | undefined = matcherFiltersByMatcher.get(matcher);
      if (!matcherFilter) {
        matcherFilter = matcher.createFilter();
        matcherFiltersByMatcher.set(matcher, matcherFilter);
      }

      // Now that we have the matcher, we can finally check to see if the file is ignored. We need to use
      // the path relative to the git repo root, since all produced matchers are relative to the git repo
      // root. Additionally, the ignore library expects relative paths to be sourced from the path library,
      // so use path.relative() to ensure the path is correctly normalized.
      const relativeFilePath: string = path.relative(gitRepoRootPath, filePath);
      return matcherFilter(relativeFilePath);
    };
  }

  private _findIgnoreMatcherForFilePath(
    filePath: string,
    ignoreMatcherMap: Map<string, IIgnoreMatcher>
  ): IIgnoreMatcher {
    if (!path.isAbsolute(filePath)) {
      throw new Error(`The filePath must be an absolute path: "${filePath}"`);
    }
    const normalizedFilePath: string = Path.convertToSlashes(filePath);

    // Find the best matcher for the file path by finding the longest matcher path that is a prefix to
    // the file path
    // TODO: Use LookupByPath to make this more efficient. Currently not possible because LookupByPath
    // does not have support for leaf node traversal.
    let longestMatcherPath: string | undefined;
    let foundMatcher: IIgnoreMatcher | undefined;

    for (const [matcherPath, matcher] of ignoreMatcherMap) {
      if (
        normalizedFilePath.startsWith(matcherPath) &&
        matcherPath.length > (longestMatcherPath?.length || 0)
      ) {
        longestMatcherPath = matcherPath;
        foundMatcher = matcher;
      }
    }
    if (!foundMatcher) {
      throw new InternalError(`Unable to find a gitignore matcher for "${filePath}"`);
    }

    return foundMatcher;
  }

  private async _getIgnoreMatchersAsync(gitRepoRootPath: string): Promise<Map<string, IIgnoreMatcher>> {
    // Return early if we've already parsed the .gitignore matchers
    if (this._ignoreMatcherByGitignoreFolder !== undefined) {
      return this._ignoreMatcherByGitignoreFolder;
    } else {
      this._ignoreMatcherByGitignoreFolder = new Map<string, IIgnoreMatcher>();
    }

    // Store the raw loaded ignore patterns in a map, keyed by the directory they were loaded from
    const rawIgnorePatternsByGitignoreFolder: Map<string, string[]> = new Map();

    // Load the .gitignore files for the working directory and all parent directories. We can loop through
    // and compare the currentPath length to the gitRepoRootPath length because we know the currentPath
    // must be under the gitRepoRootPath
    const normalizedWorkingDirectory: string = Path.convertToSlashes(this._workingDirectory);
    let currentPath: string = normalizedWorkingDirectory;
    while (currentPath.length >= gitRepoRootPath.length) {
      const gitIgnoreFilePath: string = `${currentPath}/.gitignore`;
      const gitIgnorePatterns: string[] | undefined =
        await this._tryReadGitIgnoreFileAsync(gitIgnoreFilePath);
      if (gitIgnorePatterns) {
        rawIgnorePatternsByGitignoreFolder.set(currentPath, gitIgnorePatterns);
      }
      currentPath = currentPath.slice(0, currentPath.lastIndexOf('/'));
    }

    // Load the .gitignore files for all subdirectories
    const gitignoreRelativeFilePaths: string[] = await this._findUnignoredFilesAsync('*.gitignore');
    for (const gitignoreRelativeFilePath of gitignoreRelativeFilePaths) {
      const gitignoreFilePath: string = `${normalizedWorkingDirectory}/${gitignoreRelativeFilePath}`;
      const gitIgnorePatterns: string[] | undefined =
        await this._tryReadGitIgnoreFileAsync(gitignoreFilePath);
      if (gitIgnorePatterns) {
        const parentPath: string = gitignoreFilePath.slice(0, gitignoreFilePath.lastIndexOf('/'));
        rawIgnorePatternsByGitignoreFolder.set(parentPath, gitIgnorePatterns);
      }
    }

    // Create the ignore matchers for each found .gitignore file
    for (const gitIgnoreParentPath of rawIgnorePatternsByGitignoreFolder.keys()) {
      let ignoreMatcherPatterns: string[] = [];
      currentPath = gitIgnoreParentPath;

      // Travel up the directory tree, adding the ignore patterns from each .gitignore file
      while (currentPath.length >= gitRepoRootPath.length) {
        // Get the root-relative path of the .gitignore file directory. Replace backslashes with forward
        // slashes if backslashes are the system default path separator, since gitignore patterns use
        // forward slashes.
        const rootRelativePath: string = Path.convertToSlashes(path.relative(gitRepoRootPath, currentPath));

        // Parse the .gitignore patterns according to the Git documentation:
        // https://git-scm.com/docs/gitignore#_pattern_format
        const resolvedGitIgnorePatterns: string[] = [];
        const gitIgnorePatterns: string[] | undefined = rawIgnorePatternsByGitignoreFolder.get(currentPath);
        for (let gitIgnorePattern of gitIgnorePatterns || []) {
          // If the pattern is negated, track this and trim the negation so that we can do path resolution
          let isNegated: boolean = false;
          if (gitIgnorePattern.startsWith('!')) {
            isNegated = true;
            gitIgnorePattern = gitIgnorePattern.substring(1);
          }

          // Validate if the path is a relative path. If so, make the path relative to the root directory
          // of the Git repo. Slashes at the end of the path indicate that the pattern targets a directory
          // and do not indicate the pattern is relative to the gitignore file. Non-relative patterns are
          // not processed here since they are valid for all subdirectories at or below the gitignore file
          // directory.
          const slashIndex: number = gitIgnorePattern.indexOf('/');
          if (slashIndex >= 0 && slashIndex !== gitIgnorePattern.length - 1) {
            // Trim the leading slash (if present) and append to the root relative path
            if (slashIndex === 0) {
              gitIgnorePattern = gitIgnorePattern.substring(1);
            }
            gitIgnorePattern = `${rootRelativePath}/${gitIgnorePattern}`;
          }

          // Add the negation back to the pattern if it was negated
          if (isNegated) {
            gitIgnorePattern = `!${gitIgnorePattern}`;
          }

          // Add the pattern to the list of resolved patterns in the order they are read, since the order
          // of declaration of patterns in a .gitignore file matters for negations
          resolvedGitIgnorePatterns.push(gitIgnorePattern);
        }

        // Add the patterns to the ignore matcher patterns. Since we are crawling up the directory tree to
        // the root of the Git repo we need to prepend the patterns, since the order of declaration of
        // patterns in a .gitignore file matters for negations. Do this using Array.concat so that we can
        // avoid stack overflows due to the variadic nature of Array.unshift.
        ignoreMatcherPatterns = ([] as string[]).concat(resolvedGitIgnorePatterns, ignoreMatcherPatterns);
        currentPath = currentPath.slice(0, currentPath.lastIndexOf('/'));
      }

      this._ignoreMatcherByGitignoreFolder.set(gitIgnoreParentPath, ignore().add(ignoreMatcherPatterns));
    }

    return this._ignoreMatcherByGitignoreFolder;
  }

  private async _tryReadGitIgnoreFileAsync(filePath: string): Promise<string[] | undefined> {
    let gitIgnoreContent: string | undefined;
    try {
      gitIgnoreContent = await FileSystem.readFileAsync(filePath);
    } catch (error: unknown) {
      if (!FileSystem.isFileDoesNotExistError(error as Error)) {
        throw error;
      }
    }

    const foundIgnorePatterns: string[] = [];
    if (gitIgnoreContent) {
      const gitIgnorePatterns: string[] = Text.splitByNewLines(gitIgnoreContent);
      for (const gitIgnorePattern of gitIgnorePatterns) {
        // Ignore whitespace-only lines and comments
        if (gitIgnorePattern.length === 0 || GITIGNORE_IGNORABLE_LINE_REGEX.test(gitIgnorePattern)) {
          continue;
        }
        // Push them into the array in the order that they are read, since order matters
        foundIgnorePatterns.push(gitIgnorePattern);
      }
    }

    // Only return if we found any valid patterns
    return foundIgnorePatterns.length ? foundIgnorePatterns : undefined;
  }

  private async _findUnignoredFilesAsync(searchPattern: string | undefined): Promise<string[]> {
    this._ensureGitMinimumVersion({ major: 2, minor: 22, patch: 0 });
    this._ensurePathIsUnderGitWorkingTree();

    const args: string[] = [
      '--cached',
      '--modified',
      '--others',
      '--deduplicate',
      '--exclude-standard',
      '-z'
    ];
    if (searchPattern) {
      args.push(searchPattern);
    }
    return await this._executeGitCommandAndCaptureOutputAsync({
      command: 'ls-files',
      args,
      delimiter: '\0'
    });
  }

  private async _executeGitCommandAndCaptureOutputAsync(
    options: IExecuteGitCommandOptions
  ): Promise<string[]> {
    const gitPath: string = this._getGitPathOrThrow();
    const processArgs: string[] = [options.command].concat(options.args || []);
    const childProcess: ChildProcess = Executable.spawn(gitPath, processArgs, {
      currentWorkingDirectory: this._workingDirectory,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    if (!childProcess.stdout || !childProcess.stderr) {
      throw new Error(`Failed to spawn Git process: ${gitPath} ${processArgs.join(' ')}`);
    }
    childProcess.stdout.setEncoding('utf8');
    childProcess.stderr.setEncoding('utf8');

    return await new Promise((resolve: (value: string[]) => void, reject: (error: Error) => void) => {
      const output: string[] = [];
      const stdoutBuffer: string[] = [];
      let errorMessage: string = '';

      childProcess.stdout!.on('data', (chunk: Buffer) => {
        stdoutBuffer.push(chunk.toString());
      });
      childProcess.stderr!.on('data', (chunk: Buffer) => {
        errorMessage += chunk.toString();
      });
      childProcess.on('close', (exitCode: number | null, signal: NodeJS.Signals | null) => {
        if (exitCode) {
          reject(
            new Error(`git exited with error code ${exitCode}${errorMessage ? `: ${errorMessage}` : ''}`)
          );
        } else if (signal) {
          reject(new Error(`git terminated by signal ${signal}`));
        }
        let remainder: string = '';
        for (let chunk of stdoutBuffer) {
          let delimiterIndex: number | undefined;
          while ((delimiterIndex = chunk.indexOf(options.delimiter || '\n')) >= 0) {
            output.push(`${remainder}${chunk.slice(0, delimiterIndex)}`);
            remainder = '';
            chunk = chunk.slice(delimiterIndex + 1);
          }
          remainder = chunk;
        }
        resolve(output);
      });
    });
  }

  private _getGitPathOrThrow(): string {
    const gitPath: string | undefined = this.gitPath;
    if (!gitPath) {
      throw new Error('Git is not present');
    } else {
      return gitPath;
    }
  }

  private _ensureGitMinimumVersion(minimumGitVersion: IGitVersion): void {
    const gitVersion: IGitVersion | undefined = this.getGitVersion();
    if (!gitVersion) {
      throw new Error('Git is not present');
    } else if (
      gitVersion.major < minimumGitVersion.major ||
      (gitVersion.major === minimumGitVersion.major && gitVersion.minor < minimumGitVersion.minor) ||
      (gitVersion.major === minimumGitVersion.major &&
        gitVersion.minor === minimumGitVersion.minor &&
        gitVersion.patch < minimumGitVersion.patch)
    ) {
      throw new Error(
        `The minimum Git version required is ` +
          `${minimumGitVersion.major}.${minimumGitVersion.minor}.${minimumGitVersion.patch}. ` +
          `Your version is ${gitVersion.major}.${gitVersion.minor}.${gitVersion.patch}.`
      );
    }
  }

  private _ensurePathIsUnderGitWorkingTree(): void {
    if (!this.isPathUnderGitWorkingTree()) {
      throw new Error(`The path "${this._workingDirectory}" is not under a Git working tree`);
    }
  }

  private _parseGitVersion(gitVersionOutput: string): IGitVersion {
    // This regexp matches output of "git version" that looks like
    // `git version <number>.<number>.<number>(+whatever)`
    // Examples:
    // - git version 1.2.3
    // - git version 1.2.3.4.5
    // - git version 1.2.3windows.1
    // - git version 1.2.3.windows.1
    const versionRegex: RegExp = /^git version (\d+)\.(\d+)\.(\d+)/;
    const match: RegExpMatchArray | null = versionRegex.exec(gitVersionOutput);
    if (!match) {
      throw new Error(
        `While validating the Git installation, the "git version" command produced ` +
          `unexpected output: ${JSON.stringify(gitVersionOutput)}`
      );
    }
    return {
      major: parseInt(match[1], 10),
      minor: parseInt(match[2], 10),
      patch: parseInt(match[3], 10)
    };
  }
}
