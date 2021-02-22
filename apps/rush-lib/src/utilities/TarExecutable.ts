// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Executable, FileSystem, Terminal } from '@rushstack/node-core-library';
import { ChildProcess } from 'child_process';
import * as events from 'events';
import { RushConfigurationProject } from '../api/RushConfigurationProject';

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

  public async tryUntarAsync(archivePath: string, outputFolderPath: string): Promise<boolean> {
    const childProcess: ChildProcess = Executable.spawn(this._tarExecutablePath, ['-x', '-f', archivePath], {
      currentWorkingDirectory: outputFolderPath
    });
    const [tarExitCode] = await events.once(childProcess, 'exit');
    return tarExitCode === 0;
  }

  public async tryCreateArchiveFromProjectPathsAsync(
    archivePath: string,
    paths: string[],
    project: RushConfigurationProject
  ): Promise<boolean> {
    const pathsListFilePath: string = `${project.projectRushTempFolder}/tarPaths_${Date.now()}`;
    await FileSystem.writeFileAsync(pathsListFilePath, paths.join('\n'));

    const projectFolderPath: string = project.projectFolder;
    const childProcess: ChildProcess = Executable.spawn(
      this._tarExecutablePath,
      ['-c', '-f', archivePath, '-z', '-C', projectFolderPath, '--files-from', pathsListFilePath],
      {
        currentWorkingDirectory: projectFolderPath
      }
    );
    const [tarExitCode] = await events.once(childProcess, 'exit');
    await FileSystem.deleteFileAsync(pathsListFilePath);

    return tarExitCode === 0;
  }
}
