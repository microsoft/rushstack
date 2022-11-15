// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { ChildProcess, SpawnSyncReturns } from 'child_process';
import { default as getGitRepoInfo, GitRepoInfo as IGitRepoInfo } from 'git-repo-info';
import { Executable } from '@rushstack/node-core-library';

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
   * Runs the `git check-ignore` command and returns the result.
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
