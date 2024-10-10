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
import type { Operation } from './Operation';

/**
 * @internal
 */
export interface IOperationMetadataManagerOptions {
  rushProject: RushConfigurationProject;
  phase: IPhase;
  operation: Operation;
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
  public readonly logFilenameIdentifier: string;
  private readonly _metadataFolderPath: string;
  private readonly _logPath: string;
  private readonly _errorLogPath: string;
  private readonly _logChunksPath: string;

  public constructor(options: IOperationMetadataManagerOptions) {
    const {
      rushProject,
      operation: { logFilenameIdentifier }
    } = options;
    const { projectFolder } = rushProject;

    this.logFilenameIdentifier = logFilenameIdentifier;

    const metadataFolderPath: string = `${RushConstants.projectRushFolderName}/${RushConstants.rushTempFolderName}/operation/${logFilenameIdentifier}`;

    this.stateFile = new OperationStateFile({
      projectFolder: projectFolder,
      metadataFolder: metadataFolderPath
    });

    this._metadataFolderPath = metadataFolderPath;
    this._logPath = `${projectFolder}/${metadataFolderPath}/all.log`;
    this._errorLogPath = `${projectFolder}/${metadataFolderPath}/error.log`;
    this._logChunksPath = `${projectFolder}/${metadataFolderPath}/log-chunks.jsonl`;
  }

  /**
   * Returns the relative paths of the metadata files to project folder.
   *
   * Example: `.rush/temp/operation/_phase_build/state.json`
   * Example: `.rush/temp/operation/_phase_build/all.log`
   * Example: `.rush/temp/operation/_phase_build/error.log`
   */
  public get metadataFolderPath(): string {
    return this._metadataFolderPath;
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

    try {
      const rawLogChunks: string = await FileSystem.readFileAsync(this._logChunksPath);
      const chunks: ITerminalChunk[] = [];
      for (const chunk of rawLogChunks.split('\n')) {
        if (chunk) {
          chunks.push(JSON.parse(chunk));
        }
      }
      for (const { kind, text } of chunks) {
        if (kind === TerminalChunkKind.Stderr) {
          terminalProvider.write(text, TerminalProviderSeverity.error);
        } else {
          terminalProvider.write(text, TerminalProviderSeverity.log);
        }
      }
    } catch (e) {
      if (FileSystem.isNotExistError(e)) {
        // Log chunks file doesn't exist, try to restore log file
        await restoreFromLogFile(terminal, this._logPath);
      } else {
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

async function restoreFromLogFile(terminal: ITerminal, path: string): Promise<void> {
  let logReadStream: fs.ReadStream | undefined;

  try {
    logReadStream = fs.createReadStream(path, {
      encoding: 'utf-8'
    });
    for await (const data of logReadStream) {
      terminal.write(data);
    }
  } catch (logReadStreamError) {
    if (!FileSystem.isNotExistError(logReadStreamError)) {
      throw logReadStreamError;
    }
  } finally {
    // Close the read stream
    logReadStream?.close();
  }
}
