// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { Executable, FileSystem, FileWriter, Terminal } from '@rushstack/node-core-library';
import { ChildProcess } from 'child_process';
import * as events from 'events';

import { RushConfigurationProject } from '../api/RushConfigurationProject';

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

  public static tryInitialize(terminal: Terminal): TarExecutable | undefined {
    terminal.writeVerboseLine('Trying to find "tar" binary');
    const tarExecutablePath: string | undefined = Executable.tryResolve('tar');
    if (!tarExecutablePath) {
      terminal.writeVerboseLine('"tar" was not found on the PATH');
      return undefined;
    }

    return new TarExecutable(tarExecutablePath);
  }

  /**
   * @returns
   * The "tar" exit code
   */
  public async tryUntarAsync(options: IUntarOptions): Promise<number> {
    return await this._spawnTarWithLoggingAsync(
      ['-x', '-f', options.archivePath],
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
    const pathsListFilePath: string = `${project.projectRushTempFolder}/tarPaths_${Date.now()}`;
    await FileSystem.writeFileAsync(pathsListFilePath, paths.join('\n'));

    const projectFolderPath: string = project.projectFolder;
    const tarExitCode: number = await this._spawnTarWithLoggingAsync(
      ['-c', '-f', archivePath, '-z', '-C', projectFolderPath, '--files-from', pathsListFilePath],
      projectFolderPath,
      logFilePath
    );
    await FileSystem.deleteFileAsync(pathsListFilePath);

    return tarExitCode;
  }

  private async _spawnTarWithLoggingAsync(
    args: string[],
    currentWorkingDirectory: string,
    logFilePath: string
  ): Promise<number> {
    await FileSystem.ensureFolderAsync(path.dirname(logFilePath));
    const fileWriter: FileWriter = FileWriter.open(logFilePath);
    fileWriter.write(
      [
        `Invoking "${this._tarExecutablePath} ${args.join(' ')}"`,
        '',
        '======= BEGIN PROCESS OUTPUT =======',
        ''
      ].join('\n')
    );

    const childProcess: ChildProcess = Executable.spawn(this._tarExecutablePath, args, {
      currentWorkingDirectory: currentWorkingDirectory
    });

    childProcess.stdout.on('data', (chunk) => fileWriter.write(`[stdout] ${chunk}`));
    childProcess.stderr.on('data', (chunk) => fileWriter.write(`[stderr] ${chunk}`));

    const [tarExitCode] = await events.once(childProcess, 'exit');

    fileWriter.write(
      ['======== END PROCESS OUTPUT ========', '', `Exited with code "${tarExitCode}"`].join('\n')
    );
    fileWriter.close();

    return tarExitCode;
  }
}
