// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'fs';
import { FileSystem, ITerminal } from '@rushstack/node-core-library';

import { OperationStateFile } from './OperationStateFile';
import { RushConstants } from '../RushConstants';

import type { IPhase } from '../../api/CommandLineConfiguration';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import type { IOperationStateJson } from './OperationStateFile';

/**
 * @internal
 */
export interface IOperationMetadataManagerOptions {
  rushProject: RushConfigurationProject;
  phase: IPhase;
}

/**
 * @internal
 */
export interface IOperationMetaData {
  durationInSeconds: number;
  logPath: string;
  errorLogPath: string;
}

/**
 * A helper class for managing the meta files of a operation.
 *
 * @internal
 */
export class OperationMetadataManager {
  public readonly stateFile: OperationStateFile;
  private _metadataFolder: string;
  private _logPath: string;
  private _errorLogPath: string;
  private _relativeLogPath: string;
  private _relativeErrorLogPath: string;

  public constructor(options: IOperationMetadataManagerOptions) {
    const { rushProject, phase } = options;
    const { projectFolder } = rushProject;

    const identifier: string = phase.logFilenameIdentifier;
    this._metadataFolder = `${RushConstants.projectRushFolderName}/${RushConstants.rushTempFolderName}/operation/${identifier}`;

    this.stateFile = new OperationStateFile({
      projectFolder: projectFolder,
      metadataFolder: this._metadataFolder
    });

    this._relativeLogPath = `${this._metadataFolder}/all.log`;
    this._relativeErrorLogPath = `${this._metadataFolder}/error.log`;
    this._logPath = `${projectFolder}/${this._relativeLogPath}`;
    this._errorLogPath = `${projectFolder}/${this._relativeErrorLogPath}`;
  }

  /**
   * Returns the relative paths of the metadata files to project folder.
   *
   * Example: `.rush/temp/operation/_phase_build/state.json`
   * Example: `.rush/temp/operation/_phase_build/all.log`
   * Example: `.rush/temp/operation/_phase_build/error.log`
   */
  public get relativeFilepaths(): string[] {
    return [this.stateFile.relativeFilepath, this._relativeLogPath, this._relativeErrorLogPath];
  }

  public async saveAsync({ durationInSeconds, logPath, errorLogPath }: IOperationMetaData): Promise<void> {
    const state: IOperationStateJson = {
      nonCachedDurationMs: durationInSeconds * 1000
    };
    await this.stateFile.writeAsync(state);

    try {
      await FileSystem.copyFileAsync({
        sourcePath: logPath,
        destinationPath: this._logPath
      });
    } catch (e) {
      if (!FileSystem.isNotExistError(e)) {
        throw e;
      }
    }
    try {
      await FileSystem.copyFileAsync({
        sourcePath: errorLogPath,
        destinationPath: this._relativeLogPath
      });
    } catch (e) {
      if (!FileSystem.isNotExistError(e)) {
        throw e;
      }
    }
  }

  public async tryRestoreAsync({
    terminal,
    logPath,
    errorLogPath
  }: {
    terminal: ITerminal;
    logPath: string;
    errorLogPath: string;
  }): Promise<void> {
    await this.stateFile.tryRestoreAsync();

    // Append cached log into current log file
    terminal.writeLine('');
    terminal.writeLine(`Restoring cached log file at ${this._logPath}`);
    try {
      await new Promise<void>((resolve, reject) => {
        const logReadStream: fs.ReadStream = fs.createReadStream(this._logPath, {
          encoding: 'utf-8'
        });

        logReadStream.on('data', (data) => {
          terminal.write(data);
        });
        logReadStream.on('end', () => {
          resolve();
        });
        logReadStream.on('error', (e) => {
          reject(e);
        });
      });
    } catch (e) {
      if (!FileSystem.isNotExistError(e)) {
        throw e;
      }
    }

    // Try to restore cached error log as error log file
    try {
      await FileSystem.copyFileAsync({
        sourcePath: this._errorLogPath,
        destinationPath: errorLogPath
      });
    } catch (e) {
      if (!FileSystem.isNotExistError(e)) {
        throw e;
      }
    }
  }
}
