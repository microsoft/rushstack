// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import type { ChildProcess } from 'node:child_process';
import events from 'node:events';

import { Executable, FileSystem, FileWriter } from '@rushstack/node-core-library';
import type { ITerminal } from '@rushstack/terminal';

import type { RushConfigurationProject } from '../api/RushConfigurationProject.ts';
import { EnvironmentConfiguration } from '../api/EnvironmentConfiguration.ts';
import { IS_WINDOWS } from './executionUtilities.ts';

export interface ITarOptionsBase {
  logFilePath: string;
}

export interface IUntarOptions extends ITarOptionsBase {
  archivePath: string;
  outputFolderPath: string;
}

export interface ICreateArchiveOptions extends ITarOptionsBase {
  archivePath: string;
  paths: string[];
  project: RushConfigurationProject;
}

export class TarExecutable {
  private _tarExecutablePath: string;

  private constructor(tarExecutablePath: string) {
    this._tarExecutablePath = tarExecutablePath;
  }

  public static async tryInitializeAsync(terminal: ITerminal): Promise<TarExecutable | undefined> {
    terminal.writeVerboseLine('Trying to find "tar" binary');
    const tarExecutablePath: string | undefined =
      EnvironmentConfiguration.tarBinaryPath || (await TarExecutable._tryFindTarExecutablePathAsync());
    if (!tarExecutablePath) {
      terminal.writeVerboseLine('"tar" was not found on the PATH');
      return undefined;
    } else {
      terminal.writeVerboseLine(`Using "tar" binary: ${tarExecutablePath}`);
      return new TarExecutable(tarExecutablePath);
    }
  }

  /**
   * @returns
   * The "tar" exit code
   */
  public async tryUntarAsync(options: IUntarOptions): Promise<number> {
    return await this._spawnTarWithLoggingAsync(
      // These parameters are chosen for compatibility with the very primitive bsdtar 3.3.2 shipped with Windows 10.
      [
        // [Windows bsdtar 3.3.2] Extract: tar -x [options] [<patterns>]
        '-x',
        // [Windows bsdtar 3.3.2] -m    Don't restore modification times
        '-m',
        // [Windows bsdtar 3.3.2] -f <filename>  Location of archive (default \\.\tape0)
        '-f',
        options.archivePath
      ],
      options.outputFolderPath,
      options.logFilePath
    );
  }

  /**
   * @returns
   * The "tar" exit code
   */
  public async tryCreateArchiveFromProjectPathsAsync(options: ICreateArchiveOptions): Promise<number> {
    const { project, archivePath, paths, logFilePath } = options;

    const tarInput: string = paths.join('\n');

    // On Windows, tar.exe will report a "Failed to clean up compressor" error if the target folder
    // does not exist (GitHub #2622)
    await FileSystem.ensureFolderAsync(path.dirname(archivePath));

    const projectFolderPath: string = project.projectFolder;
    const tarExitCode: number = await this._spawnTarWithLoggingAsync(
      // These parameters are chosen for compatibility with the very primitive bsdtar 3.3.2 shipped with Windows 10.
      [
        // [Windows bsdtar 3.3.2] -c Create
        '-c',
        // [Windows bsdtar 3.3.2] -f <filename>  Location of archive (default \\.\tape0)
        '-f',
        archivePath,
        // [Windows bsdtar 3.3.2] -z, -j, -J, --lzma  Compress archive with gzip/bzip2/xz/lzma
        '-z',
        // [GNU tar 1.33] -T, --files-from=FILE      get names to extract or create from FILE
        //
        // Windows bsdtar does not document this parameter, but seems to accept it.
        '--files-from=-'
      ],
      projectFolderPath,
      logFilePath,
      tarInput
    );

    return tarExitCode;
  }

  private async _spawnTarWithLoggingAsync(
    args: string[],
    currentWorkingDirectory: string,
    logFilePath: string,
    input?: string
  ): Promise<number> {
    // Runs "tar" with the specified args and logs its output to the specified location.
    // The log file looks like this:
    //
    // Windows:
    // Start time: Mon Apr 19 2021 13:06:40 GMT-0700 (Pacific Daylight Time)
    // Invoking "C:\WINDOWS\system32\tar.exe -x -f E:\rush-cache\d18105f7f83eb610b468be4e2421681f4a52e44d"
    //
    // ======= BEGIN PROCESS OUTPUT =======
    // [stdout] <tar stdout output>
    // [stderr] <tar stderr output>
    // ======== END PROCESS OUTPUT ========
    //
    // Exited with code "0"
    //
    // Linux:
    // Start time: Mon Apr 19 2021 13:06:40 GMT-0700 (Pacific Daylight Time)
    // Invoking "/bin/tar -x -f /home/username/rush-cache/d18105f7f83eb610b468be4e2421681f4a52e44d"
    //
    // ======= BEGIN PROCESS OUTPUT =======
    // [stdout] <tar stdout output>
    // [stderr] <tar stderr output>
    // ======== END PROCESS OUTPUT ========
    //
    // Exited with code "0"

    await FileSystem.ensureFolderAsync(path.dirname(logFilePath));
    const fileWriter: FileWriter = FileWriter.open(logFilePath);
    fileWriter.write(
      [
        `Start time: ${new Date().toString()}`,
        `Invoking "${this._tarExecutablePath} ${args.join(' ')}"`,
        '',
        `======= BEGIN PROCESS INPUT ======`,
        input || '',
        '======== END PROCESS INPUT =======',
        '======= BEGIN PROCESS OUTPUT =======',
        ''
      ].join('\n')
    );

    const childProcess: ChildProcess = Executable.spawn(this._tarExecutablePath, args, {
      currentWorkingDirectory: currentWorkingDirectory
    });

    childProcess.stdout!.on('data', (chunk) => fileWriter.write(`[stdout] ${chunk}`));
    childProcess.stderr!.on('data', (chunk) => fileWriter.write(`[stderr] ${chunk}`));

    if (input !== undefined) {
      childProcess.stdin!.write(input, 'utf-8');
      childProcess.stdin!.end();
    }

    // Wait for process to exit and all streams to close
    const [tarExitCode] = await events.once(childProcess, 'close');

    fileWriter.write(
      ['======== END PROCESS OUTPUT ========', '', `Exited with code "${tarExitCode}"`].join('\n')
    );
    fileWriter.close();

    return tarExitCode;
  }

  private static async _tryFindTarExecutablePathAsync(): Promise<string | undefined> {
    if (IS_WINDOWS) {
      // If we're running on Windows, first try to use the OOB tar executable. If
      // we're running in the Git Bash, the tar executable on the PATH doesn't handle
      // Windows file paths correctly.
      // eslint-disable-next-line dot-notation
      const windowsFolderPath: string | undefined = process.env['WINDIR'];
      if (windowsFolderPath) {
        const defaultWindowsTarExecutablePath: string = `${windowsFolderPath}\\system32\\tar.exe`;
        if (await FileSystem.existsAsync(defaultWindowsTarExecutablePath)) {
          return defaultWindowsTarExecutablePath;
        }
      }
    }

    return Executable.tryResolve('tar');
  }
}
