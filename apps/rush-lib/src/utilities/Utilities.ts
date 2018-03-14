// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as child_process from 'child_process';
import * as fsx from 'fs-extra';
import * as os from 'os';
import * as rimraf from 'rimraf';
import * as tty from 'tty';
import * as path from 'path';
import { JsonFile } from '@microsoft/node-core-library';

import IPackageJson from './IPackageJson';

/**
 * @public
 */
export default class Utilities {
  /**
   * For a scoped NPM package name this separates the scope and name parts.  For example:
   * parseScopedPackageName('@my-scope/myproject') = { scope: '@my-scope', name: 'myproject' }
   * parseScopedPackageName('myproject') = { scope: '', name: 'myproject' }
   */
  public static parseScopedPackageName(scopedName: string): { scope: string, name: string } {
    if (scopedName.substr(0, 1) !== '@') {
      return { scope: '', name: scopedName };
    }

    const slashIndex: number = scopedName.indexOf('/');
    if (slashIndex >= 0) {
      return { scope: scopedName.substr(0, slashIndex), name: scopedName.substr(slashIndex + 1) };
    } else {
      throw new Error('Invalid scoped name: ' + scopedName);
    }
  }

  /**
   * NodeJS equivalent of performance.now().
   */
  public static getTimeInMs(): number {
    let seconds: number;
    let nanoseconds: number;
    [seconds, nanoseconds] = process.hrtime();
    return seconds * 1000 + nanoseconds / 1000000;
  }

  /**
   * Returns the values from a Set<T>
   */
  public static getSetAsArray<T>(set: Set<T>): T[] {
    // When ES6 is supported, we can use Array.from() instead.
    const result: T[] = [];
    set.forEach((value: T) => {
      result.push(value);
    });
    return result;
  }

  /**
   * Retries a function until a timeout is reached. The function is expected to throw if it failed and
   *  should be retried.
   */
  public static retryUntilTimeout<TResult>(fn: () => TResult,
                                           maxWaitTimeMs: number,
                                           getTimeoutError: (innerError: Error) => Error,
                                           fnName: string): TResult {
    const startTime: number = Utilities.getTimeInMs();
    let looped: boolean = false;

    let result: TResult;
    // tslint:disable-next-line:no-constant-condition
    while (true) {
      try {
        result = fn();
        break;
      } catch (e) {
        looped = true;
        const currentTime: number = Utilities.getTimeInMs();
        if (currentTime - startTime > maxWaitTimeMs) {
          throw getTimeoutError(e);
        }
      }
    }

    if (looped) {
      const currentTime: number = Utilities.getTimeInMs();
      const totalSeconds: string = ((currentTime - startTime) / 1000.0).toFixed(2);
      console.log(`${fnName}() stalled for ${totalSeconds} seconds`);
    }

    return result;
  }

  /**
   * Creates the specified folder by calling fsx.mkdirsSync(), but using a
   * retry loop to recover from temporary locks that may be held by other processes.
   * If the folder already exists, no error occurs.
   */
  public static createFolderWithRetry(folderName: string): void {
    // Note: If a file exists with the same name, then we fall through and report
    // an error.
    if (Utilities.directoryExists(folderName)) {
      return;
    }

    // We need to do a simple "fs.mkdirSync(localModulesFolder)" here,
    // however if the folder we deleted above happened to contain any files,
    // then there seems to be some OS process (virus scanner?) that holds
    // a lock on the folder for a split second, which causes mkdirSync to
    // fail.  To workaround that, retry for up to 7 seconds before giving up.
    const maxWaitTimeMs: number = 7 * 1000;

    return Utilities.retryUntilTimeout(() => fsx.mkdirsSync(folderName),
                                       maxWaitTimeMs,
                                       (e) => new Error(`Error: ${e}${os.EOL}Often this is caused by a file lock ` +
                                                        'from a process such as your text editor, command prompt, ' +
                                                        'or "gulp serve"'),
                                       'createFolderWithRetry');
  }

  /**
   * Determines if the path points to a file and that it exists.
   */
  public static fileExists(filePath: string): boolean {
    let exists: boolean = false;

    try {
      const lstat: fsx.Stats = fsx.lstatSync(filePath);
      exists = lstat.isFile();
    } catch (e) { /* no-op */ }

    return exists;
  }

  /**
   * Determines if a path points to a directory and that it exists.
   */
  public static directoryExists(directoryPath: string): boolean {
    let exists: boolean = false;

    try {
      const lstat: fsx.Stats = fsx.lstatSync(directoryPath);
      exists = lstat.isDirectory();
    } catch (e) { /* no-op */ }

    return exists;
  }

  /**
   * BE VERY CAREFUL CALLING THIS FUNCTION!
   * If you specify the wrong folderPath (e.g. "/"), it could potentially delete your entire
   * hard disk.
   */
  public static dangerouslyDeletePath(folderPath: string): void {
    try {
      rimraf.sync(folderPath, { disableGlob: true });
    } catch (e) {
      throw new Error(e.message + os.EOL + 'Often this is caused by a file lock'
        + ' from a process such as your text editor, command prompt, or "gulp serve"');
    }
  }

  /**
   * Attempts to delete a file. If it does not exist, or the path is not a file, it no-ops.
   */
  public static deleteFile(filePath: string): void {
    if (Utilities.fileExists(filePath)) {
      console.log(`Deleting: ${filePath}`);
      fsx.unlinkSync(filePath);
    }
  }

  /*
   * Returns true if outputFilename has a more recent last modified timestamp
   * than all of the inputFilenames, which would imply that we don't need to rebuild it.
   * Returns false if any of the files does not exist.
   * NOTE: The filenames can also be paths for directories, in which case the directory
   * timestamp is compared.
   */
  public static isFileTimestampCurrent(outputFilename: string, inputFilenames: string[]): boolean {
    if (!fsx.existsSync(outputFilename)) {
      return false;
    }
    const outputStats: fsx.Stats = fsx.statSync(outputFilename);

    for (const inputFilename of inputFilenames) {
      if (!fsx.existsSync(inputFilename)) {
        return false;
      }

      const inputStats: fsx.Stats = fsx.statSync(inputFilename);
      if (outputStats.mtime < inputStats.mtime) {
        return false;
      }
    }

    return true;
  }

  /**
   * Returns the width of the console, measured in columns
   */
  public static getConsoleWidth(): number {
    const stdout: tty.WriteStream = process.stdout as tty.WriteStream;
    if (stdout && stdout.columns) {
      return stdout.columns;
    }
    return 80;
  }

  /**
   * Executes the command with the specified command-line parameters, and waits for it to complete.
   * The current directory will be set to the specified workingDirectory.
   */
  public static executeCommand(command: string, args: string[], workingDirectory: string,
    suppressOutput: boolean = false, environmentVariables?: { [key: string]: string | undefined }): void {

    Utilities._executeCommandInternal(command, args, workingDirectory,
      suppressOutput ? undefined : [0, 1, 2],
      environmentVariables);
  }

  /**
   * Executes the command with the specified command-line parameters, and waits for it to complete.
   * The current directory will be set to the specified workingDirectory.
   */
  public static executeCommandAndCaptureOutput(command: string, args: string[], workingDirectory: string,
    environmentVariables?: { [key: string]: string | undefined }): string {

    const  result: child_process.SpawnSyncReturns<Buffer>
      = Utilities._executeCommandInternal(command, args, workingDirectory,
        ['pipe', 'pipe', 'pipe'], environmentVariables);

    return result.stdout.toString();
  }

  /**
   * Attempts to run Utilities.executeCommand() up to maxAttempts times before giving up.
   */
  public static executeCommandWithRetry(command: string, args: string[], maxAttempts: number,
    workingDirectory: string, suppressOutput: boolean = false, retryCallback?: () => void): void {

    if (maxAttempts < 1) {
      throw new Error('The maxAttempts parameter cannot be less than 1');
    }

    let attemptNumber: number = 1;

    // tslint:disable-next-line:no-constant-condition
    while (true) {
      try {
        Utilities.executeCommand(command, args, workingDirectory, suppressOutput);
      } catch (error) {
        console.log(os.EOL + 'The command failed:');
        console.log(` ${command} ` + args.join(' '));
        console.log(`ERROR: ${error.toString()}`);

        if (attemptNumber < maxAttempts) {
          ++attemptNumber;
          console.log(`Trying again (attempt #${attemptNumber})...` + os.EOL);
          if (retryCallback) {
            retryCallback();
          }
          continue;
        } else {
          console.error(`Giving up after ${attemptNumber} attempts` + os.EOL);
          throw error;
        }
      }
      break;
    }
  }

  /**
   * Executes the command with the specified command-line parameters, and waits for it to complete.
   * The current directory will be set to the specified workingDirectory.
   */
  public static executeCommandAsync(command: string, args: string[], workingDirectory: string,
    environmentVariables?: { [key: string]: string }): child_process.ChildProcess {
    // This is a workaround for GitHub issue #25330.  It is not as complete as the workaround above,
    // but there doesn't seem to be an easy asynchronous solution.
    // https://github.com/nodejs/node-v0.x-archive/issues/25330
    if (fsx.existsSync(command + '.cmd')) {
      command += '.cmd';
    }

    // This is needed since we specify shell=true below:
    const escapedCommand: string = Utilities.escapeShellParameter(command);
    const escapedArgs: string[] = args.map((x) => Utilities.escapeShellParameter(x));

    return child_process.spawn(escapedCommand, escapedArgs, {
      cwd: workingDirectory,
      shell: true,
      env: environmentVariables
    });
  }

  /**
   * Executes the command using cmd if running on windows, or using sh if running on a non-windows OS.
   * @param command - the command to run on shell
   * @param workingDirectory - working directory for running this command
   * @param environmentVariables - environment variables for running this command
   * @beta
   */
  public static executeShellCommand(
    command: string,
    workingDirectory: string,
    environmentVariables?: { [key: string]: string | undefined },
    captureOutput: boolean = false
  ): child_process.SpawnSyncReturns<Buffer> {
    let shellCommand: string = process.env.comspec || 'cmd';
    let commandFlags: string = '/d /s /c';
    let useShell: boolean = true;
    if (process.platform !== 'win32') {
      shellCommand = 'sh';
      commandFlags = '-c';
      useShell = false;
    }

    const result: child_process.SpawnSyncReturns<Buffer> = child_process.spawnSync(
      shellCommand,
      [commandFlags, command],
      {
        cwd: workingDirectory,
        shell: useShell,
        env: environmentVariables,
        stdio: captureOutput ? ['pipe', 'pipe', 'pipe'] : [0, 1, 2]
      });

    Utilities._processResult(result);
    return result;
  }

  /**
   * Executes the command using cmd if running on windows, or using sh if running on a non-windows OS.
   * @param command - the command to run on shell
   * @param workingDirectory - working directory for running this command
   * @param environmentVariables - environment variables for running this command
   * @beta
   */
  public static executeShellCommandAsync(
    command: string,
    workingDirectory: string,
    environmentVariables?: { [key: string]: string | undefined },
    captureOutput: boolean = false
  ): child_process.ChildProcess {
    let shellCommand: string = process.env.comspec || 'cmd';
    let commandFlags: string = '/d /s /c';
    let useShell: boolean = true;
    if (process.platform !== 'win32') {
      shellCommand = 'sh';
      commandFlags = '-c';
      useShell = false;
    }

    return child_process.spawn(
      shellCommand,
      [commandFlags, command],
      {
        cwd: workingDirectory,
        shell: useShell,
        env: environmentVariables,
        stdio: captureOutput ? ['pipe', 'pipe', 'pipe'] : [0, 1, 2]
      });
  }

  /**
   * For strings passed to a shell command, this adds appropriate escaping
   * to avoid misinterpretation of spaces or special characters.
   *
   * Example: 'hello there' --> '"hello there"'
   */
  public static escapeShellParameter(parameter: string): string {
    return '"' + parameter + '"';
  }

  /**
   * Installs a package by name and version in the specified directory.
   */
  public static installPackageInDirectory(
    directory: string,
    packageName: string,
    version: string,
    tempPackageTitle: string,
    maxInstallAttempts: number,
    suppressOutput: boolean = false
  ): void {
    if (fsx.existsSync(directory)) {
      console.log('Deleting old files from ' + directory);
      Utilities.dangerouslyDeletePath(directory);
    }

    Utilities.createFolderWithRetry(directory);

    const npmPackageJson: IPackageJson = {
      dependencies: {
        [packageName]: version
      },
      description: 'Temporary file generated by the Rush tool',
      name: tempPackageTitle,
      private: true,
      version: '0.0.0'
    };
    JsonFile.save(npmPackageJson, path.join(directory, 'package.json'));

    console.log(os.EOL + 'Running "npm install" in ' + directory);

    // NOTE: Here we use whatever version of NPM we happen to find in the PATH
    Utilities.executeCommandWithRetry('npm', ['install'], maxInstallAttempts, directory, suppressOutput);
  }

  /**
   * Executes the command with the specified command-line parameters, and waits for it to complete.
   * The current directory will be set to the specified workingDirectory.
   */
  private static _executeCommandInternal(
    command: string, args: string[], workingDirectory: string,
    stdio: (string|number)[] | undefined,
    environmentVariables: { [key: string]: string | undefined } | undefined): child_process.SpawnSyncReturns<Buffer> {

    const options: child_process.SpawnSyncOptions = {
      cwd: workingDirectory,
      shell: true,
      stdio: stdio,
      env: environmentVariables
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
    const escapedCommand: string = command.indexOf(' ') < 0 ? command
      : Utilities.escapeShellParameter(command);

    const escapedArgs: string[] = args.map((x) => Utilities.escapeShellParameter(x));

    let result: child_process.SpawnSyncReturns<Buffer> = child_process.spawnSync(escapedCommand,
      escapedArgs, options);

    /* tslint:disable:no-any */
    if (result.error && (result.error as any).errno === 'ENOENT') {
      // This is a workaround for GitHub issue #25330
      // https://github.com/nodejs/node-v0.x-archive/issues/25330
      result = child_process.spawnSync(command + '.cmd', args, options);
    }
    /* tslint:enable:no-any */

    Utilities._processResult(result);
    return result;
  }

  private static _processResult(result: child_process.SpawnSyncReturns<Buffer>): void {
    if (result.error) {
      result.error.message += os.EOL + (result.stderr ? result.stderr.toString() + os.EOL : '');
      throw result.error;
    }

    if (result.status) {
      throw new Error('The command failed with exit code ' + result.status + os.EOL +
        (result.stderr ? result.stderr.toString() : ''));
    }
  }
}
