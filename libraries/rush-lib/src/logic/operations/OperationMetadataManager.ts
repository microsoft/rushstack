// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'fs';
import { Async, FileSystem, type IFileSystemCopyFileOptions } from '@rushstack/node-core-library';
import {
  type ITerminalChunk,
  TerminalChunkKind,
  TerminalProviderSeverity,
  type ITerminal,
  type ITerminalProvider
} from '@rushstack/terminal';

import { OperationStateFile } from './OperationStateFile';
import { RushConstants } from '../RushConstants';

import type { IPhase } from '../../api/CommandLineConfiguration';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import type { IOperationStateJson } from './OperationStateFile';

import { parser } from 'stream-json/jsonl/Parser';
import { chain } from 'stream-chain';
import type Chain from 'stream-chain';

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
  logChunksPath: string;
  cobuildContextId: string | undefined;
  cobuildRunnerId: string | undefined;
}

export interface ILogChunkStorage {
  chunks: ITerminalChunk[];
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
  private _logChunksPath: string;
  private _relativeLogPath: string;
  private _relativeLogChunksPath: string;
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
    this._relativeLogChunksPath = `${this._metadataFolder}/log-chunks.json`;
    this._logPath = `${projectFolder}/${this._relativeLogPath}`;
    this._errorLogPath = `${projectFolder}/${this._relativeErrorLogPath}`;
    this._logChunksPath = `${projectFolder}/${this._relativeLogChunksPath}`;
  }

  /**
   * Returns the relative paths of the metadata files to project folder.
   *
   * Example: `.rush/temp/operation/_phase_build/state.json`
   * Example: `.rush/temp/operation/_phase_build/all.log`
   * Example: `.rush/temp/operation/_phase_build/error.log`
   */
  public get relativeFilepaths(): string[] {
    return [
      this.stateFile.relativeFilepath,
      this._relativeLogPath,
      this._relativeErrorLogPath,
      this._relativeLogChunksPath
    ];
  }

  public async saveAsync({
    durationInSeconds,
    cobuildContextId,
    cobuildRunnerId,
    logPath,
    errorLogPath,
    logChunksPath
  }: IOperationMetaData): Promise<void> {
    const state: IOperationStateJson = {
      nonCachedDurationMs: durationInSeconds * 1000,
      cobuildContextId,
      cobuildRunnerId
    };
    await this.stateFile.writeAsync(state);

    const copyFileOptions: IFileSystemCopyFileOptions[] = [
      {
        sourcePath: logPath,
        destinationPath: this._logPath
      },
      {
        sourcePath: errorLogPath,
        destinationPath: this._errorLogPath
      },
      {
        sourcePath: logChunksPath,
        destinationPath: this._logChunksPath
      }
    ];

    // Try to copy log files
    await Async.forEachAsync(copyFileOptions, async (options) => {
      try {
        await FileSystem.copyFileAsync(options);
      } catch (e) {
        if (!FileSystem.isNotExistError(e)) {
          throw e;
        }
      }
    });
  }

  public async tryRestoreAsync({
    terminal,
    terminalProvider,
    errorLogPath
  }: {
    terminalProvider: ITerminalProvider;
    terminal: ITerminal;
    errorLogPath: string;
  }): Promise<void> {
    await this.stateFile.tryRestoreAsync();

    let logReadStream: fs.ReadStream | undefined;
    try {
      if (await FileSystem.existsAsync(this._logChunksPath)) {
        await new Promise((resolve, reject) => {
          logReadStream = fs.createReadStream(this._logChunksPath, {
            encoding: 'utf-8'
          });
          const pipeline: Chain = chain([
            parser(),
            function process({ text, kind }: ITerminalChunk) {
              if (kind === TerminalChunkKind.Stderr) {
                terminalProvider.write(text, TerminalProviderSeverity.error);
              } else {
                terminalProvider.write(text, TerminalProviderSeverity.log);
              }
            }
          ]);
          const fileReadPipeline: Chain = logReadStream.pipe(pipeline);
          fileReadPipeline.on('end', resolve);
          fileReadPipeline.on('error', reject);
        });
      } else {
        logReadStream = fs.createReadStream(this._logPath, {
          encoding: 'utf-8'
        });
        for await (const data of logReadStream) {
          terminal.write(data);
        }
      }
    } catch (e) {
      if (!FileSystem.isNotExistError(e)) {
        throw e;
      }
    } finally {
      // Close the read stream
      logReadStream?.close();
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
