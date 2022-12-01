// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { ChildProcess, SpawnSyncReturns } from 'child_process';
import { default as getGitRepoInfo, GitRepoInfo as IGitRepoInfo } from 'git-repo-info';
import { Executable, FileSystem, InternalError } from '@rushstack/node-core-library';
import { default as ignore, Ignore as IIgnoreMatcher } from 'ignore';

const GITIGNORE_IGNORABLE_LINE_REGEX: RegExp = /^(?:(?:#.*)|(?:\s+))$/;
const UNINITIALIZED: 'UNINITIALIZED' = 'UNINITIALIZED';

export interface IGitVersion {
  major: number;
  minor: number;
  patch: number;
}

interface IExecuteGitCommandOptions {
  command: string;
  args?: string[];
  stdinArgs?: string[];
}

interface IExecuteGitCommandResult {
  outputLines: ReadonlyArray<string>;
  errorLines: ReadonlyArray<string>;
  exitCode: number;
}

export class GitUtilities {
  private readonly _workingDirectory: string;
  private _ignoreMatcherMap: Map<string, IIgnoreMatcher> | undefined;
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

  public async getUnignoredFilesAsync(): Promise<Set<string>> {
    this._ensureGitMinimumVersion({ major: 2, minor: 22, patch: 0 });
    this._ensurePathIsUnderGitWorkingTree();

    const result: IExecuteGitCommandResult = await this._executeGitCommandAndCaptureOutputAsync({
      command: 'ls-files',
      args: ['--cached', '--modified', '--others', '--deduplicate', '--exclude-standard']
    });

    if (result.exitCode !== 0) {
      throw new Error(
        `The "git ls-files" command failed with status ${result.exitCode}: ` + result.errorLines.join('\n')
      );
    }

    // Return the set of unignored files. The output is relative to the working directory, so join
    // them to make an absolute path.
    return new Set(result.outputLines.map((line: string) => path.join(this._workingDirectory, line)));
  }

  public async checkIgnoreAsync(filePaths: Iterable<string>): Promise<Set<string>> {
    this._ensurePathIsUnderGitWorkingTree();

    const gitInfo: IGitRepoInfo = this.getGitInfo()!;
    const gitRepoRootPath: string = gitInfo.root;
    const ignoreMatcherMap: Map<string, IIgnoreMatcher> = await this._getIgnoreMatchersAsync(gitRepoRootPath);
    const ignoredFiles: Set<string> = new Set();

    for (const filePath of filePaths) {
      if (!path.isAbsolute(filePath)) {
        throw new Error(`The filePath must be an absolute path: "${filePath}"`);
      }

      // Find the best matcher for the file path by finding the longest matcher path that is a prefix to
      // the file path
      let longestMatcherPath: string | undefined;
      let foundMatcher: IIgnoreMatcher | undefined;
      for (const [matcherPath, matcher] of ignoreMatcherMap) {
        if (filePath.startsWith(matcherPath) && matcherPath.length > (longestMatcherPath?.length || 0)) {
          longestMatcherPath = matcherPath;
          foundMatcher = matcher;
        }
      }
      if (!foundMatcher) {
        throw new InternalError(`Unable to find a gitignore matcher for "${filePath}"`);
      }

      // Now that we have the matcher, we can finally check to see if the file is ignored. We need to use
      // the path relative to the git repo root, since all produced matchers are relative to the git repo
      // root. Additionally, the ignore library expects relative paths to be sourced from the path library,
      // so use path.relative() to ensure the path is correctly normalized.
      const relativeFilePath: string = path.relative(gitRepoRootPath, filePath);
      if (foundMatcher.ignores(relativeFilePath)) {
        ignoredFiles.add(filePath);
      }
    }

    return ignoredFiles;
  }

  /**
   * Returns the list of files that are ignored by Git.
   */
  public async checkIgnore(filePaths: Iterable<string>): Promise<Set<string>> {
    this._ensureGitMinimumVersion({ major: 2, minor: 18, patch: 0 });
    this._ensurePathIsUnderGitWorkingTree();

    const stdinArgs: string[] = [];
    for (const filePath of filePaths) {
      stdinArgs.push(filePath);
    }
    const result: IExecuteGitCommandResult = await this._executeGitCommandAndCaptureOutputAsync({
      command: 'check-ignore',
      args: ['--stdin'],
      stdinArgs
    });

    // 0 = one or more are ignored, 1 = none are ignored, 128 = fatal error
    // Treat all non-0 and non-1 exit codes as fatal errors.
    // See: https://git-scm.com/docs/git-check-ignore
    if (result.exitCode !== 0 && result.exitCode !== 1) {
      throw new Error(
        `The "git check-ignore" command failed with status ${result.exitCode}: ` +
          result.errorLines.join('\n')
      );
    }

    // Backslashes are escaped in the output when surrounded by quotes, so trim the quotes unescape them
    const unescapedOutput: Set<string> = new Set<string>();
    for (const outputLine of result.outputLines) {
      let unescapedOutputLine: string = outputLine;
      if (outputLine.startsWith('"') && outputLine.endsWith('"')) {
        const trimmedQuotesOutputLine: string = outputLine.substring(1, outputLine.length - 1);
        unescapedOutputLine = trimmedQuotesOutputLine.replace(/\\\\/g, '\\');
      }
      unescapedOutput.add(unescapedOutputLine);
    }
    return unescapedOutput;
  }

  private async _executeGitCommandAndCaptureOutputAsync(
    options: IExecuteGitCommandOptions
  ): Promise<IExecuteGitCommandResult> {
    const gitPath: string = this._getGitPathOrThrow();
    const processArgs: string[] = [options.command, ...(options.args || [])];
    const childProcess: ChildProcess = Executable.spawn(gitPath, processArgs, {
      currentWorkingDirectory: this._workingDirectory,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    if (!childProcess.stdout || !childProcess.stderr || !childProcess.stdin) {
      throw new Error(`Failed to spawn Git process: ${gitPath} ${processArgs.join(' ')}`);
    }
    childProcess.stdout.setEncoding('utf8');

    return await new Promise(
      (resolve: (value: IExecuteGitCommandResult) => void, reject: (error: Error) => void) => {
        const outputLines: string[] = [];
        const errorLines: string[] = [];
        childProcess.stdout!.on('data', (data: string) => {
          for (const line of data.split('\n')) {
            if (line) {
              outputLines.push(line);
            }
          }
        });
        childProcess.stderr!.on('data', (data: string) => {
          for (const line of data.split('\n')) {
            if (line) {
              errorLines.push(line);
            }
          }
        });
        childProcess.on('close', (exitCode: number) => {
          resolve({ outputLines, errorLines, exitCode });
        });

        // If stdin arguments are provided, feed them to stdin and close it.
        if (options.stdinArgs) {
          for (const arg of options.stdinArgs) {
            childProcess.stdin!.write(`${arg}\n`);
          }
          childProcess.stdin!.end();
        }
      }
    );
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

  private async _getIgnoreMatchersAsync(gitRepoRootPath: string): Promise<Map<string, IIgnoreMatcher>> {
    // Return early if we've already parsed the .gitignore matchers
    if (this._ignoreMatcherMap !== undefined) {
      return this._ignoreMatcherMap;
    } else {
      this._ignoreMatcherMap = new Map<string, IIgnoreMatcher>();
    }

    // Store the raw loaded ignore patterns in a map, keyed by the directory they were loaded from
    const rawIgnorePatternMap: Map<string, string[]> = new Map();

    // Load the .gitignore files for the working directory and all parent directories We can loop through
    // and compare the currentPath length to the gitRepoRootPath length because we know the currentPath
    // must be under the gitRepoRootPath
    let currentPath: string = this._workingDirectory;
    while (currentPath.length >= gitRepoRootPath.length) {
      const gitIgnoreFilePath: string = `${currentPath}/.gitignore`;
      const gitIgnorePatterns: string[] | undefined = await this._readGitIgnoreFileAsync(gitIgnoreFilePath);
      if (gitIgnorePatterns) {
        rawIgnorePatternMap.set(currentPath, gitIgnorePatterns);
      }
      currentPath = path.dirname(currentPath);
    }

    // Load the .gitignore files for all subdirectories
    const unignoredFilePaths: Set<string> = await this.getUnignoredFilesAsync();
    for (const unignoredFilePath of unignoredFilePaths) {
      if (path.basename(unignoredFilePath) === '.gitignore') {
        const gitIgnorePatterns: string[] | undefined = await this._readGitIgnoreFileAsync(unignoredFilePath);
        if (gitIgnorePatterns) {
          const parentPath: string = path.dirname(unignoredFilePath);
          rawIgnorePatternMap.set(parentPath, gitIgnorePatterns);
        }
      }
    }

    // Create the ignore matchers for each found .gitignore file
    for (const gitIgnoreParentPath of rawIgnorePatternMap.keys()) {
      const ignoreMatcherPatterns: string[] = [];
      currentPath = gitIgnoreParentPath;

      // Travel up the directory tree, adding the ignore patterns from each .gitignore file
      while (currentPath.length >= gitRepoRootPath.length) {
        // Get the root-relative path of the .gitignore file directory. Replace backslashes with forward
        // slashes if backslashes are the system default path separator, since gitignore patterns use
        // forward slashes.
        let rootRelativePath: string = path.relative(gitRepoRootPath, currentPath);
        if (path.sep === path.win32.sep) {
          rootRelativePath = rootRelativePath.replace(/\\/g, '/');
        }

        // Parse the .gitignore patterns according to the Git documentation:
        // https://git-scm.com/docs/gitignore#_pattern_format
        const resolvedGitIgnorePatterns: string[] = [];
        const gitIgnorePatterns: string[] | undefined = rawIgnorePatternMap.get(currentPath);
        for (let gitIgnorePattern of gitIgnorePatterns || []) {
          // If the pattern is negated, track this and trim the negation so that we can do path resolution
          let isNegated: boolean = false;
          if (gitIgnorePattern.startsWith('!')) {
            isNegated = true;
            gitIgnorePattern = gitIgnorePattern.substring(1);
          }

          // Validate if the path is a relative path. If so, make the path relative to the root directory
          // of the Git repo. Slashes at the end of the path indicate that the pattern targets a directory
          // and do not indicate the pattern is relative to the gitignore file.
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
        // patterns in a .gitignore file matters for negations
        ignoreMatcherPatterns.unshift(...resolvedGitIgnorePatterns);
        currentPath = path.dirname(currentPath);
      }

      this._ignoreMatcherMap.set(gitIgnoreParentPath, ignore().add(ignoreMatcherPatterns));
    }

    return this._ignoreMatcherMap;
  }

  private async _readGitIgnoreFileAsync(filePath: string): Promise<string[] | undefined> {
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
      const gitIgnorePatterns: string[] = gitIgnoreContent.replace(/\r\n/g, '\n').split('\n');
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

  private _parseGitVersion(gitVersionOutput: string): IGitVersion {
    // This regexp matches output of "git version" that looks like `git version <number>.<number>.<number>(+whatever)`
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
