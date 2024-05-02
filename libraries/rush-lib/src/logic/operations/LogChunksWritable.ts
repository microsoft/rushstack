// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { TerminalWritable, type ITerminalChunk } from '@rushstack/terminal';

import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { RushConstants } from '../RushConstants';
import { getRelativeLogFilePathBase } from './ProjectLogWritable';

import Stringer from 'stream-json/jsonl/Stringer';
import { chain } from 'stream-chain';
import type Chain from 'stream-chain';
import * as fs from 'fs';

/**
 * A new terminal stream that writes all log chunks to a JSON format so they can be faithfully reconstructed
 *  during build cache restores. This is used for adding warning + error messages in cobuilds where the original
 *  logs cannot be completely restored from the existing `all.log` and `error.log` files.
 */
export class LogChunksWritable extends TerminalWritable {
  public readonly logChunksPath: string;
  public readonly relativeLogChunksPath: string;

  private readonly _writeChain: Chain;

  private readonly _chunks: ITerminalChunk[] = [];
  private readonly _chunkFileStream: fs.WriteStream;

  public constructor(
    project: RushConfigurationProject,
    /**
     * A unique identifier for the log file. This is used to generate the prefix for the log file name.
     */
    logFilenameIdentifier: string
  ) {
    super();

    const { logChunksPath, relativeLogChunksPath } = LogChunksWritable.getLogFilePaths({
      project,
      logFilenameIdentifier
    });
    this.logChunksPath = logChunksPath;
    this.relativeLogChunksPath = relativeLogChunksPath;

    this._chunkFileStream = fs.createWriteStream(logChunksPath);

    this._writeChain = chain([new Stringer(), this._chunkFileStream]);
  }

  public static getLogFilePaths({
    project,
    logFilenameIdentifier,
    isLegacyLog = false
  }: {
    project: RushConfigurationProject;
    logFilenameIdentifier: string;
    isLegacyLog?: boolean;
  }): {
    logChunksPath: string;
    relativeLogChunksPath: string;
  } {
    const { projectFolder } = project;

    const logFileBaseName: string = getRelativeLogFilePathBase(
      project,
      logFilenameIdentifier,
      isLegacyLog,
      `.rush/${RushConstants.rushTempFolderName}/operations`
    );
    const relativeLogChunksPath: string = `${logFileBaseName}.chunks.jsonl`;
    const logChunksPath: string = `${projectFolder}/${relativeLogChunksPath}`;

    return {
      logChunksPath,
      relativeLogChunksPath
    };
  }

  protected onWriteChunk(chunk: ITerminalChunk): void {
    this._writeChain.write(chunk);
  }

  protected onClose(): void {
    this._writeChain.end();
    this._chunkFileStream.close();
  }
}
