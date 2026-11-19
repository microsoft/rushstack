// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';

import {
  Async,
  FileSystem,
  type IFileSystemCopyFileOptions,
  NewlineKind
} from '@rushstack/node-core-library';
import {
  type ITerminalChunk,
  TerminalChunkKind,
  TerminalProviderSeverity,
  TerminalWritable,
  TextRewriterTransform,
  type ITerminal,
  type ITerminalProvider
} from '@rushstack/terminal';

import { OperationStateFile } from './OperationStateFile';
import { RushConstants } from '../RushConstants';
import type { IOperationStateJson } from './OperationStateFile';
import type { Operation } from './Operation';
import { type IStopwatchResult, Stopwatch } from '../../utilities/Stopwatch';

/**
 * @internal
 */
export interface IOperationMetadataManagerOptions {
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
  readonly #metadataFolderPath: string;
  readonly #logPath: string;
  readonly #errorLogPath: string;
  readonly #logChunksPath: string;
  public wasCobuilt: boolean = false;

  public constructor(options: IOperationMetadataManagerOptions) {
    const {
      operation: { logFilenameIdentifier, associatedProject }
    } = options;
    const { projectFolder } = associatedProject;

    this.logFilenameIdentifier = logFilenameIdentifier;

    const metadataFolderPath: string = `${RushConstants.projectRushFolderName}/${RushConstants.rushTempFolderName}/operation/${logFilenameIdentifier}`;

    this.stateFile = new OperationStateFile({
      projectFolder: projectFolder,
      metadataFolder: metadataFolderPath
    });

    this.#metadataFolderPath = metadataFolderPath;
    this.#logPath = `${projectFolder}/${metadataFolderPath}/all.log`;
    this.#errorLogPath = `${projectFolder}/${metadataFolderPath}/error.log`;
    this.#logChunksPath = `${projectFolder}/${metadataFolderPath}/log-chunks.jsonl`;
  }

  /**
   * Returns the relative paths of the metadata files to project folder.
   *
   * Example: `.rush/temp/operation/_phase_build/state.json`
   * Example: `.rush/temp/operation/_phase_build/all.log`
   * Example: `.rush/temp/operation/_phase_build/error.log`
   */
  public get metadataFolderPath(): string {
    return this.#metadataFolderPath;
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
        destinationPath: this.#logPath
      },
      {
        sourcePath: errorLogPath,
        destinationPath: this.#errorLogPath
      },
      {
        sourcePath: logChunksPath,
        destinationPath: this.#logChunksPath
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

        // This run didn't write the file (a run that writes nothing to stderr has no error log), so delete
        // the copy an earlier run left. The metadata folder is a cached output and must describe only this run.
        await FileSystem.deleteFileAsync(options.destinationPath);
      }
    });
  }

  public async tryRestoreAsync({
    terminal,
    terminalProvider,
    errorLogPath,
    cobuildContextId,
    cobuildRunnerId
  }: {
    terminalProvider: ITerminalProvider;
    terminal: ITerminal;
    errorLogPath: string;
    cobuildContextId?: string;
    cobuildRunnerId?: string;
  }): Promise<void> {
    await this.stateFile.tryRestoreAsync();
    this.wasCobuilt =
      this.stateFile.state?.cobuildContextId !== undefined &&
      cobuildContextId !== undefined &&
      this.stateFile.state?.cobuildContextId === cobuildContextId &&
      this.stateFile.state?.cobuildRunnerId !== cobuildRunnerId;

    let errorLogText: string | undefined;
    try {
      const rawLogChunks: string = await FileSystem.readFileAsync(this.#logChunksPath);
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
      errorLogText = getErrorLogText(chunks);
    } catch (e) {
      if (FileSystem.isNotExistError(e)) {
        // Log chunks file doesn't exist, try to restore log file
        await restoreFromLogFile(terminal, this.#logPath);
      } else {
        throw e;
      }
    }

    // The error log file shows the stderr of the run that produced the cache entry. When the entry has log
    // chunks, write it from them rather than copying the cached error log: an entry saved before saveAsync
    // deleted stale files can hold the error log of an earlier run that failed.
    if (errorLogText !== undefined) {
      if (errorLogText) {
        await FileSystem.writeFileAsync(errorLogPath, errorLogText, { ensureFolderExists: true });
      } else {
        await FileSystem.deleteFileAsync(errorLogPath);
      }
    } else {
      // Try to restore cached error log as error log file
      try {
        await FileSystem.copyFileAsync({
          sourcePath: this.#errorLogPath,
          destinationPath: errorLogPath
        });
      } catch (e) {
        if (!FileSystem.isNotExistError(e)) {
          throw e;
        }

        // The entry has no error log, so don't leave the one from the last run that executed.
        await FileSystem.deleteFileAsync(errorLogPath);
      }
    }
  }

  public tryRestoreStopwatch(originalStopwatch: IStopwatchResult): IStopwatchResult {
    if (this.wasCobuilt && this.stateFile.state && originalStopwatch.endTime !== undefined) {
      const endTime: number = originalStopwatch.endTime;
      const startTime: number = Math.max(0, endTime - (this.stateFile.state.nonCachedDurationMs ?? 0));
      return Stopwatch.fromState({
        startTime,
        endTime
      });
    }
    return originalStopwatch;
  }
}

/**
 * Collects the text of the stderr chunks written to it.
 */
class StderrTextWritable extends TerminalWritable {
  public text: string = '';

  protected onWriteChunk(chunk: ITerminalChunk): void {
    if (chunk.kind === TerminalChunkKind.Stderr) {
      this.text += chunk.text;
    }
  }
}

/**
 * Returns the error log file text for an operation's log chunks: the stderr chunks, rewritten the same way
 * as the error log that `initializeProjectLogFilesAsync` writes when the operation runs.
 */
function getErrorLogText(chunks: ReadonlyArray<ITerminalChunk>): string {
  const stderrText: StderrTextWritable = new StderrTextWritable();
  const textRewriter: TextRewriterTransform = new TextRewriterTransform({
    destination: stderrText,
    removeColors: true,
    normalizeNewlines: NewlineKind.OsDefault
  });
  for (const chunk of chunks) {
    if (chunk.kind === TerminalChunkKind.Stderr) {
      textRewriter.writeChunk(chunk);
    }
  }
  textRewriter.close();
  return stderrText.text;
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
