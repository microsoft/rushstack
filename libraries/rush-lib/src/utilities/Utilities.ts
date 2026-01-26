// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as child_process from 'node:child_process';
import * as path from 'node:path';
import { performance } from 'node:perf_hooks';
import { Transform } from 'node:stream';

import {
  JsonFile,
  type IPackageJson,
  FileSystem,
  FileConstants,
  type FileSystemStats,
  SubprocessTerminator,
  Executable,
  type IWaitForExitResult,
  Async,
  type IWaitForExitResultWithoutOutput
} from '@rushstack/node-core-library';

import type { RushConfiguration } from '../api/RushConfiguration';
import { syncNpmrc } from './npmrcUtilities';
import { EnvironmentVariableNames } from '../api/EnvironmentConfiguration';
import { RushConstants } from '../logic/RushConstants';
import { escapeArgumentIfNeeded, IS_WINDOWS } from './executionUtilities';

export type UNINITIALIZED = 'UNINITIALIZED';
// eslint-disable-next-line @typescript-eslint/no-redeclare
export const UNINITIALIZED: UNINITIALIZED = 'UNINITIALIZED';

export interface IEnvironment {
  // NOTE: the process.env doesn't actually support "undefined" as a value.
  // If you try to assign it, it will be converted to the text string "undefined".
  // But this typing is needed for reading values from the dictionary, and for
  // subsets that get combined.
  [environmentVariableName: string]: string | undefined;
}

/**
 * Options for {@link Utilities.executeCommandAsync}.
 */
export interface IExecuteCommandOptions {
  command: string;
  args: string[];
  workingDirectory: string;
  environment?: IEnvironment;
  suppressOutput?: boolean;
  keepEnvironment?: boolean;
  /**
   * Note that this takes precedence over {@link IExecuteCommandOptions.suppressOutput}
   */
  onStdoutStreamChunk?: (chunk: string) => string | void;
  captureExitCodeAndSignal?: boolean;
}

/**
 * Options for {@link Utilities.installPackageInDirectoryAsync}.
 */
export interface IInstallPackageInDirectoryOptions {
  directory: string;
  packageName: string;
  version: string;
  tempPackageTitle: string;
  maxInstallAttempts: number;
  commonRushConfigFolder: string | undefined;
  suppressOutput?: boolean;
}

export interface ILifecycleCommandOptions {
  /**
   * The rush configuration, if the command is running in a rush repo.
   */
  rushConfiguration: RushConfiguration | undefined;

  /**
   * Working directory for running the command
   */
  workingDirectory: string;

  /**
   * The folder containing a local .npmrc, which will be used for the INIT_CWD environment variable
   */
  initCwd: string;

  /**
   * If true, suppress the process's output, but if there is a nonzero exit code then print stderr
   */
  handleOutput: boolean;

  /**
   * an existing environment to copy instead of process.env
   */
  initialEnvironment?: IEnvironment;

  /**
   * Options for what should be added to the PATH variable
   */
  environmentPathOptions: IEnvironmentPathOptions;

  /**
   * If true, attempt to establish a NodeJS IPC channel to the child process.
   */
  ipc?: boolean;

  /**
   * If true, wire up SubprocessTerminator to the child process.
   */
  connectSubprocessTerminator?: boolean;
}

export interface IEnvironmentPathOptions {
  /**
   * If true, include <project root>/node_modules/.bin in the PATH. If both this and
   * {@link IEnvironmentPathOptions.includeRepoBin} are set, this path will take precedence.
   */
  includeProjectBin?: boolean;

  /**
   * If true, include <repo root>/common/temp/node_modules/.bin in the PATH.
   */
  includeRepoBin?: boolean;

  /**
   * Additional folders to be prepended to the search PATH.
   */
  additionalPathFolders?: string[] | undefined;
}

export interface IDisposable {
  dispose(): void;
}

export type IExecuteCommandAndCaptureOutputOptions = Omit<
  IExecuteCommandOptions,
  'suppressOutput' | 'onStdoutStreamChunk'
>;

interface ICreateEnvironmentForRushCommandPathOptions extends IEnvironmentPathOptions {
  rushJsonFolder: string | undefined;
  projectRoot: string | undefined;
  commonTempFolder: string | undefined;
}

interface ICreateEnvironmentForRushCommandOptions {
  /**
   * The INIT_CWD environment variable
   */
  initCwd?: string;

  /**
   * an existing environment to copy instead of process.env
   */
  initialEnvironment?: IEnvironment;

  /**
   * Options for what should be added to the PATH variable
   */
  pathOptions?: ICreateEnvironmentForRushCommandPathOptions;
}

type OptionalKeys<T> = {
  [K in keyof T]-?: {} extends Pick<T, K> ? K : never;
}[keyof T];

export type OptionalToUndefined<T> = Omit<T, OptionalKeys<T>> & {
  [K in OptionalKeys<T>]-?: Exclude<T[K], undefined> | undefined;
};

type IExecuteCommandInternalOptions = Omit<IExecuteCommandOptions, 'suppressOutput'> & {
  stdio: child_process.SpawnSyncOptions['stdio'];
  captureOutput: boolean;
};

export interface ICommandAndArgs {
  command: string;
  args: string[];
}

export class Utilities {
  public static syncNpmrc: typeof syncNpmrc = syncNpmrc;

  /**
   * Node.js equivalent of performance.now().
   */
  public static getTimeInMs(): number {
    return performance.now();
  }

  /**
   * Retries a function until a timeout is reached. The function is expected to throw if it failed and
   *  should be retried.
   */
  public static retryUntilTimeout<TResult>(
    fn: () => TResult,
    maxWaitTimeMs: number,
    getTimeoutError: (innerError: Error) => Error,
    fnName: string
  ): TResult {
    const startTime: number = Utilities.getTimeInMs();
    let looped: boolean = false;

    let result: TResult;
    for (;;) {
      try {
        result = fn();
        break;
      } catch (e) {
        looped = true;
        const currentTime: number = Utilities.getTimeInMs();
        if (currentTime - startTime > maxWaitTimeMs) {
          throw getTimeoutError(e as Error);
        }
      }
    }

    if (looped) {
      const currentTime: number = Utilities.getTimeInMs();
      const totalSeconds: string = ((currentTime - startTime) / 1000.0).toFixed(2);
      // This logging statement isn't meaningful to the end-user. `fnName` should be updated
      // to something like `operationDescription`
      // eslint-disable-next-line no-console
      console.log(`${fnName}() stalled for ${totalSeconds} seconds`);
    }

    return result;
  }

  /**
   * Creates the specified folder by calling FileSystem.ensureFolder(), but using a
   * retry loop to recover from temporary locks that may be held by other processes.
   * If the folder already exists, no error occurs.
   */
  public static createFolderWithRetry(folderName: string): void {
    // Note: If a file exists with the same name, then we fall through and report
    // an error.
    if (Utilities.directoryExists(folderName)) {
      return;
    }

    // We need to do a simple "FileSystem.ensureFolder(localModulesFolder)" here,
    // however if the folder we deleted above happened to contain any files,
    // then there seems to be some OS process (virus scanner?) that holds
    // a lock on the folder for a split second, which causes mkdirSync to
    // fail.  To workaround that, retry for up to 7 seconds before giving up.
    const maxWaitTimeMs: number = 7 * 1000;

    return Utilities.retryUntilTimeout(
      () => FileSystem.ensureFolder(folderName),
      maxWaitTimeMs,
      (e) =>
        new Error(
          `Error: ${e}\nOften this is caused by a file lock ` +
            'from a process such as your text editor, command prompt, ' +
            'or a filesystem watcher.'
        ),
      'createFolderWithRetry'
    );
  }

  /**
   * Determines if a path points to a directory and that it exists.
   */
  public static directoryExists(directoryPath: string): boolean {
    let exists: boolean = false;

    try {
      const lstat: FileSystemStats = FileSystem.getLinkStatistics(directoryPath);
      exists = lstat.isDirectory();
    } catch (e) {
      /* no-op */
    }

    return exists;
  }

  /**
   * BE VERY CAREFUL CALLING THIS FUNCTION!
   * If you specify the wrong folderPath (e.g. "/"), it could potentially delete your entire
   * hard disk.
   */
  public static dangerouslyDeletePath(folderPath: string): void {
    try {
      FileSystem.deleteFolder(folderPath);
    } catch (e) {
      throw new Error(
        `${(e as Error).message}\nOften this is caused by a file lock from a process ` +
          'such as your text editor, command prompt, or a filesystem watcher'
      );
    }
  }

  /*
   * Returns true if dateToCompare is more recent than all of the inputFilenames, which
   * would imply that we don't need to rebuild it. Returns false if any of the files
   * does not exist.
   * NOTE: The filenames can also be paths for directories, in which case the directory
   * timestamp is compared.
   */
  public static async isFileTimestampCurrentAsync(
    dateToCompare: Date,
    inputFilePaths: string[]
  ): Promise<boolean> {
    let anyAreOutOfDate: boolean = false;
    await Async.forEachAsync(
      inputFilePaths,
      async (filePath) => {
        if (!anyAreOutOfDate) {
          let inputStats: FileSystemStats | undefined;
          try {
            inputStats = await FileSystem.getStatisticsAsync(filePath);
          } catch (e) {
            if (FileSystem.isNotExistError(e)) {
              // eslint-disable-next-line require-atomic-updates
              anyAreOutOfDate = true;
            } else {
              throw e;
            }
          }

          if (inputStats && dateToCompare < inputStats.mtime) {
            // eslint-disable-next-line require-atomic-updates
            anyAreOutOfDate = true;
          }
        }
      },
      { concurrency: 10 }
    );

    return !anyAreOutOfDate;
  }

  public static async executeCommandAsync(
    options: IExecuteCommandOptions & { captureExitCodeAndSignal: true }
  ): Promise<Pick<IWaitForExitResult, 'exitCode' | 'signal'>>;
  public static async executeCommandAsync(options: IExecuteCommandOptions): Promise<void>;
  /**
   * Executes the command with the specified command-line parameters, and waits for it to complete.
   * The current directory will be set to the specified workingDirectory.
   */
  public static async executeCommandAsync(
    options: IExecuteCommandOptions
  ): Promise<void | IWaitForExitResultWithoutOutput> {
    const {
      command,
      args,
      workingDirectory,
      suppressOutput,
      onStdoutStreamChunk,
      environment,
      keepEnvironment,
      captureExitCodeAndSignal
    } = options;
    const { exitCode, signal } = await Utilities._executeCommandInternalAsync({
      command,
      args,
      workingDirectory,
      stdio: onStdoutStreamChunk
        ? // Inherit the stdin and stderr streams, but pipe the stdout stream, which will then be piped
          // to the process's stdout after being intercepted by the onStdoutStreamChunk callback.
          ['inherit', 'pipe', 'inherit']
        : suppressOutput
          ? // If the output is being suppressed, create pipes for all streams to prevent the child process
            // from printing to the parent process's (this process's) stdout/stderr, but allow the stdout and
            // stderr to be inspected if an error occurs.
            // TODO: Consider ignoring stdout and stdin and only piping stderr for inspection on error.
            ['pipe', 'pipe', 'pipe']
          : // If the output is not being suppressed or intercepted, inherit all streams from the parent process.
            ['inherit', 'inherit', 'inherit'],
      environment,
      keepEnvironment,
      onStdoutStreamChunk,
      captureOutput: false,
      captureExitCodeAndSignal
    });

    if (captureExitCodeAndSignal) {
      return { exitCode, signal };
    }
  }

  /**
   * Executes the command with the specified command-line parameters, and waits for it to complete.
   * The current directory will be set to the specified workingDirectory.
   */
  public static async executeCommandAndCaptureOutputAsync(
    options: IExecuteCommandAndCaptureOutputOptions & { captureExitCodeAndSignal?: false }
  ): Promise<string>;
  public static async executeCommandAndCaptureOutputAsync(
    options: IExecuteCommandAndCaptureOutputOptions & { captureExitCodeAndSignal: true }
  ): Promise<IWaitForExitResult<string>>;
  public static async executeCommandAndCaptureOutputAsync(
    options: IExecuteCommandAndCaptureOutputOptions
  ): Promise<string | IWaitForExitResult<string>> {
    const result: IWaitForExitResult<string> = await Utilities._executeCommandInternalAsync({
      ...options,
      stdio: ['pipe', 'pipe', 'pipe'],
      captureOutput: true
    });

    if (options.captureExitCodeAndSignal) {
      return result;
    } else {
      return result.stdout;
    }
  }

  /**
   * Attempts to run Utilities.executeCommand() up to maxAttempts times before giving up.
   */
  public static async executeCommandWithRetryAsync(
    options: IExecuteCommandOptions,
    maxAttempts: number,
    retryCallback?: () => void
  ): Promise<void> {
    if (maxAttempts < 1) {
      throw new Error('The maxAttempts parameter cannot be less than 1');
    }

    let attemptNumber: number = 1;

    for (;;) {
      try {
        await Utilities.executeCommandAsync(options);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.log('\nThe command failed:');
        const { command, args } = options;
        // eslint-disable-next-line no-console
        console.log(` ${command} ` + args.join(' '));
        // eslint-disable-next-line no-console
        console.log(`ERROR: ${(error as Error).toString()}`);

        if (attemptNumber < maxAttempts) {
          ++attemptNumber;
          // eslint-disable-next-line no-console
          console.log(`Trying again (attempt #${attemptNumber})...\n`);
          if (retryCallback) {
            retryCallback();
          }

          continue;
        } else {
          // eslint-disable-next-line no-console
          console.error(`Giving up after ${attemptNumber} attempts\n`);
          throw error;
        }
      }

      break;
    }
  }

  /**
   * Executes the command using cmd if running on windows, or using sh if running on a non-windows OS.
   * @param command - the command to run on shell
   * @param options - options for how the command should be run
   */
  public static executeLifecycleCommand(command: string, options: ILifecycleCommandOptions): number {
    const result: child_process.SpawnSyncReturns<string | Buffer> =
      Utilities._executeLifecycleCommandInternal(command, child_process.spawnSync, options);

    if (options.handleOutput) {
      Utilities._processResult({
        error: result.error,
        status: result.status,
        stderr: result.stderr.toString()
      });
    }

    if (result.status !== null) {
      return result.status;
    } else {
      throw result.error || new Error('An unknown error occurred.');
    }
  }

  /**
   * Executes the command using cmd if running on windows, or using sh if running on a non-windows OS.
   * @param command - the command to run on shell
   * @param options - options for how the command should be run
   */
  public static executeLifecycleCommandAsync(
    command: string,
    options: ILifecycleCommandOptions
  ): child_process.ChildProcess {
    const child: child_process.ChildProcess = Utilities._executeLifecycleCommandInternal(
      command,
      child_process.spawn,
      options
    );
    if (options.connectSubprocessTerminator) {
      SubprocessTerminator.killProcessTreeOnExit(child, SubprocessTerminator.RECOMMENDED_OPTIONS);
    }
    return child;
  }

  /**
   * Installs a package by name and version in the specified directory.
   */
  public static async installPackageInDirectoryAsync({
    packageName,
    version,
    tempPackageTitle,
    commonRushConfigFolder,
    maxInstallAttempts,
    suppressOutput,
    directory
  }: IInstallPackageInDirectoryOptions): Promise<void> {
    directory = path.resolve(directory);
    const directoryExists: boolean = await FileSystem.existsAsync(directory);
    if (directoryExists) {
      // eslint-disable-next-line no-console
      console.log('Deleting old files from ' + directory);
    }

    await FileSystem.ensureEmptyFolderAsync(directory);

    const npmPackageJson: IPackageJson = {
      dependencies: {
        [packageName]: version
      },
      description: 'Temporary file generated by the Rush tool',
      name: tempPackageTitle,
      private: true,
      version: '0.0.0'
    };
    await JsonFile.saveAsync(npmPackageJson, path.join(directory, FileConstants.PackageJson));

    if (commonRushConfigFolder) {
      Utilities.syncNpmrc({
        sourceNpmrcFolder: commonRushConfigFolder,
        targetNpmrcFolder: directory,
        supportEnvVarFallbackSyntax: false,
        // Filter out npm-incompatible properties when using npm to install packages
        // to avoid warnings about unknown config properties
        filterNpmIncompatibleProperties: true
      });
    }

    // eslint-disable-next-line no-console
    console.log('\nRunning "npm install" in ' + directory);

    // NOTE: Here we use whatever version of NPM we happen to find in the PATH
    await Utilities.executeCommandWithRetryAsync(
      {
        command: 'npm',
        args: ['install'],
        workingDirectory: directory,
        environment: Utilities._createEnvironmentForRushCommand({}),
        suppressOutput
      },
      maxInstallAttempts
    );
  }

  /**
   * Copies the file "sourcePath" to "destinationPath", overwriting the target file location.
   * If the source file does not exist, then the target file is deleted.
   */
  public static syncFile(sourcePath: string, destinationPath: string): void {
    if (FileSystem.exists(sourcePath)) {
      // eslint-disable-next-line no-console
      console.log(`Copying "${sourcePath}"`);
      // eslint-disable-next-line no-console
      console.log(`  --> "${destinationPath}"`);
      FileSystem.copyFile({ sourcePath, destinationPath });
    } else {
      if (FileSystem.exists(destinationPath)) {
        // If the source file doesn't exist and there is one in the target, delete the one in the target
        // eslint-disable-next-line no-console
        console.log(`Deleting ${destinationPath}`);
        FileSystem.deleteFile(destinationPath);
      }
    }
  }

  public static getRushConfigNotFoundError(): Error {
    return new Error(`Unable to find ${RushConstants.rushJsonFilename} configuration file`);
  }

  public static async usingAsync<TDisposable extends IDisposable>(
    getDisposableAsync: () => Promise<TDisposable> | IDisposable,
    doActionAsync: (disposable: TDisposable) => Promise<void> | void
  ): Promise<void> {
    let disposable: TDisposable | undefined;
    try {
      disposable = (await getDisposableAsync()) as TDisposable;
      await doActionAsync(disposable);
    } finally {
      disposable?.dispose();
    }
  }

  public static trimAfterLastSlash(filePath: string): string {
    const indexOfLastSlash: number = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
    if (indexOfLastSlash < 0) {
      return filePath;
    }
    return filePath.substring(0, indexOfLastSlash);
  }

  /**
   * If the path refers to a symlink, `FileSystem.exists()` would normally test whether the symlink
   * points to a target that exists. By contrast, `existsOrIsBrokenSymlink()` will return true even if
   * the symlink exists but its target does not. */
  public static existsOrIsSymlink(linkPath: string): boolean {
    try {
      FileSystem.getLinkStatistics(linkPath);
      return true;
    } catch (err) {
      return false;
    }
  }

  /** @internal */
  public static _convertCommandAndArgsToShell(command: string, isWindows?: boolean): ICommandAndArgs;
  public static _convertCommandAndArgsToShell(options: ICommandAndArgs, isWindows?: boolean): ICommandAndArgs;
  public static _convertCommandAndArgsToShell(
    options: ICommandAndArgs | string,
    isWindows: boolean = IS_WINDOWS
  ): ICommandAndArgs {
    let shellCommand: string;
    let commandFlags: string[];
    if (isWindows) {
      shellCommand = process.env.comspec || 'cmd';
      commandFlags = ['/d', '/s', '/c'];
    } else {
      shellCommand = 'sh';
      commandFlags = ['-c'];
    }

    let commandToRun: string;
    if (typeof options === 'string') {
      commandToRun = options;
    } else {
      const { command, args } = options;
      const normalizedCommand: string = escapeArgumentIfNeeded(command, isWindows);
      const normalizedArgs: string[] = [];
      for (const arg of args) {
        normalizedArgs.push(escapeArgumentIfNeeded(arg, isWindows));
      }

      commandToRun = [normalizedCommand, ...normalizedArgs].join(' ');
    }

    return {
      command: shellCommand,
      args: [...commandFlags, commandToRun]
    };
  }

  private static _executeLifecycleCommandInternal<TCommandResult>(
    commandAndArgs: string,
    spawnFunction: (
      command: string,
      args: string[],
      spawnOptions: child_process.SpawnOptions
    ) => TCommandResult,
    options: ILifecycleCommandOptions
  ): TCommandResult {
    const {
      initCwd,
      initialEnvironment,
      environmentPathOptions,
      rushConfiguration,
      workingDirectory,
      handleOutput,
      ipc,
      connectSubprocessTerminator
    } = options;
    const environment: IEnvironment = Utilities._createEnvironmentForRushCommand({
      initCwd,
      initialEnvironment,
      pathOptions: {
        ...environmentPathOptions,
        rushJsonFolder: rushConfiguration?.rushJsonFolder,
        projectRoot: workingDirectory,
        commonTempFolder: rushConfiguration ? rushConfiguration.commonTempFolder : undefined
      }
    });

    const stdio: child_process.StdioOptions = handleOutput ? ['pipe', 'pipe', 'pipe'] : [0, 1, 2];
    if (ipc) {
      stdio.push('ipc');
    }

    const spawnOptions: child_process.SpawnOptions = {
      cwd: workingDirectory,
      env: environment,
      stdio
    };

    if (connectSubprocessTerminator) {
      Object.assign(spawnOptions, SubprocessTerminator.RECOMMENDED_OPTIONS);
    }

    const { command, args } = Utilities._convertCommandAndArgsToShell(commandAndArgs);

    if (IS_WINDOWS) {
      const shellCommand: string = [command, ...args].join(' ');
      return spawnFunction(shellCommand, [], { ...spawnOptions, shell: true });
    } else {
      return spawnFunction(command, args, spawnOptions);
    }
  }

  /**
   * Returns a process.env environment suitable for executing lifecycle scripts.
   * @param initialEnvironment - an existing environment to copy instead of process.env
   *
   * @remarks
   * Rush._assignRushInvokedFolder() assigns the `RUSH_INVOKED_FOLDER` variable globally
   * via the parent process's environment.
   */
  private static _createEnvironmentForRushCommand(
    options: ICreateEnvironmentForRushCommandOptions
  ): IEnvironment {
    if (options.initialEnvironment === undefined) {
      options.initialEnvironment = process.env;
    }

    // Set some defaults for the environment
    const environment: IEnvironment = {};
    if (options.pathOptions?.rushJsonFolder) {
      environment.RUSHSTACK_FILE_ERROR_BASE_FOLDER = options.pathOptions.rushJsonFolder;
    }

    for (const key of Object.getOwnPropertyNames(options.initialEnvironment)) {
      const normalizedKey: string = IS_WINDOWS ? key.toUpperCase() : key;

      // If Rush itself was invoked inside a lifecycle script, this may be set and would interfere
      // with Rush's installations.  If we actually want it, we will set it explicitly below.
      if (normalizedKey === 'INIT_CWD') {
        continue;
      }

      // When NPM invokes a lifecycle event, it copies its entire configuration into environment
      // variables.  Rush is supposed to be a deterministic controlled environment, so don't bring
      // this along.
      //
      // NOTE: Longer term we should clean out the entire environment and use rush.json to bring
      // back specific environment variables that the repo maintainer has determined to be safe.
      if (normalizedKey.match(/^NPM_CONFIG_/)) {
        continue;
      }

      // Use the uppercased environment variable name on Windows because environment variable names
      // are case-insensitive on Windows
      environment[normalizedKey] = options.initialEnvironment[key];
    }

    // When NPM invokes a lifecycle script, it sets an environment variable INIT_CWD that remembers
    // the directory that NPM started in.  This allows naive scripts to change their current working directory
    // and invoke NPM operations, while still be able to find a local .npmrc file.  Although Rush recommends
    // for toolchain scripts to be professionally written (versus brittle stuff like
    // "cd ./lib && npm run tsc && cd .."), we support INIT_CWD for compatibility.
    //
    // More about this feature: https://github.com/npm/npm/pull/12356
    if (options.initCwd) {
      environment['INIT_CWD'] = options.initCwd; // eslint-disable-line dot-notation
    }

    if (options.pathOptions) {
      if (options.pathOptions.includeRepoBin && options.pathOptions.commonTempFolder) {
        environment.PATH = Utilities._prependNodeModulesBinToPath(
          environment.PATH,
          options.pathOptions.commonTempFolder
        );
      }

      if (options.pathOptions.includeProjectBin && options.pathOptions.projectRoot) {
        environment.PATH = Utilities._prependNodeModulesBinToPath(
          environment.PATH,
          options.pathOptions.projectRoot
        );
      }

      if (options.pathOptions.additionalPathFolders) {
        environment.PATH = [...options.pathOptions.additionalPathFolders, environment.PATH].join(
          path.delimiter
        );
      }
    }

    // Communicate to downstream calls that they should not try to run hooks
    environment[EnvironmentVariableNames._RUSH_RECURSIVE_RUSHX_CALL] = '1';

    return environment;
  }

  /**
   * Prepend the node_modules/.bin folder under the specified folder to the specified PATH variable. For example,
   * if `rootDirectory` is "/foobar" and `existingPath` is "/bin", this function will return
   * "/foobar/node_modules/.bin:/bin"
   */
  private static _prependNodeModulesBinToPath(
    existingPath: string | undefined,
    rootDirectory: string
  ): string {
    const binPath: string = path.resolve(rootDirectory, 'node_modules', '.bin');
    if (existingPath) {
      return `${binPath}${path.delimiter}${existingPath}`;
    } else {
      return binPath;
    }
  }

  /**
   * Executes the command with the specified command-line parameters, and waits for it to complete.
   * The current directory will be set to the specified workingDirectory.
   */
  private static async _executeCommandInternalAsync(
    options: IExecuteCommandInternalOptions & { captureOutput: true }
  ): Promise<IWaitForExitResult<string>>;
  /**
   * Executes the command with the specified command-line parameters, and waits for it to complete.
   * The current directory will be set to the specified workingDirectory. This does not capture output.
   */
  private static async _executeCommandInternalAsync(
    options: IExecuteCommandInternalOptions & { captureOutput: false | undefined }
  ): Promise<IWaitForExitResultWithoutOutput>;
  private static async _executeCommandInternalAsync({
    command,
    args,
    workingDirectory,
    stdio,
    environment,
    keepEnvironment,
    onStdoutStreamChunk,
    captureOutput,
    captureExitCodeAndSignal
  }: IExecuteCommandInternalOptions): Promise<IWaitForExitResult<string> | IWaitForExitResultWithoutOutput> {
    const spawnOptions: child_process.SpawnSyncOptions = {
      cwd: workingDirectory,
      shell: true,
      stdio: stdio,
      env: keepEnvironment
        ? environment
        : Utilities._createEnvironmentForRushCommand({ initialEnvironment: environment }),
      maxBuffer: 10 * 1024 * 1024 // Set default max buffer size to 10MB
    };

    // This is needed since we specify shell=true below.
    // NOTE: On Windows if we escape "NPM", the spawnSync() function runs something like this:
    //   [ 'C:\\Windows\\system32\\cmd.exe', '/s', '/c', '""NPM" "install""' ]
    //
    // Due to a bug with Windows cmd.exe, the npm.cmd batch file's "%~dp0" variable will
    // return the current working directory instead of the batch file's directory.
    // The workaround is to not escape, npm, i.e. do this instead:
    //   [ 'C:\\Windows\\system32\\cmd.exe', '/s', '/c', '"npm "install""' ]
    //
    // We will come up with a better solution for this when we promote executeCommand()
    // into node-core-library, but for now this hack will unblock people:

    // Only escape the command if it actually contains spaces:
    const escapedCommand: string = escapeArgumentIfNeeded(command);

    const escapedArgs: string[] = args.map((x) => escapeArgumentIfNeeded(x));
    const shellCommand: string = [escapedCommand, ...escapedArgs].join(' ');

    const childProcess: child_process.ChildProcess = child_process.spawn(shellCommand, spawnOptions);

    if (onStdoutStreamChunk) {
      const inspectStream: Transform = new Transform({
        transform: onStdoutStreamChunk
          ? (
              chunk: string | Buffer,
              encoding: BufferEncoding,
              callback: (error?: Error, data?: string | Buffer) => void
            ) => {
              const chunkString: string = chunk.toString();
              const updatedChunk: string | void = onStdoutStreamChunk(chunkString);
              callback(undefined, updatedChunk ?? chunk);
            }
          : undefined
      });

      childProcess.stdout?.pipe(inspectStream).pipe(process.stdout);
    }

    return await Executable.waitForExitAsync(childProcess, {
      encoding: captureOutput ? 'utf8' : undefined,
      throwOnNonZeroExitCode: !captureExitCodeAndSignal,
      throwOnSignal: !captureExitCodeAndSignal
    });
  }

  private static _processResult({
    error,
    stderr,
    status
  }: {
    error: Error | undefined;
    stderr: string;
    status: number | null;
  }): void {
    if (error) {
      error.message += `\n${stderr}`;
      if (status) {
        error.message += `\nExited with status ${status}`;
      }

      throw error;
    }

    if (status) {
      throw new Error(`The command failed with exit code ${status}\n${stderr}`);
    }
  }
}
