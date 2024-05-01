// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem, JsonFile } from '@rushstack/node-core-library';
import { TerminalWritable, type ITerminalChunk } from '@rushstack/terminal';

import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { PackageNameParsers } from '../../api/PackageNameParsers';
import { RushConstants } from '../RushConstants';
import { getRelativeLogFilePathBase } from './ProjectLogWritable';

/**
 * A new terminal stream that writes all log chunks to a JSON format so they can be faithfully reconstructed
 *  during build cache restores. This is used for adding warning + error messages in cobuilds where the original
 *  logs cannot be completely restored from the existing `all.log` and `error.log` files.
 */
export class LogChunksWritable extends TerminalWritable {
  public readonly logChunksPath: string;
  public readonly relativeLogChunksPath: string;

  private readonly _chunks: ITerminalChunk[] = [];

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

    const logFileBaseName: string = getRelativeLogFilePathBase(project, logFilenameIdentifier, isLegacyLog);
    const relativeLogChunksPath: string = `${logFileBaseName}.chunks.json`;
    const logChunksPath: string = `${projectFolder}/${relativeLogChunksPath}`;

    return {
      logChunksPath,
      relativeLogChunksPath
    };
  }

  protected onWriteChunk(chunk: ITerminalChunk): void {
    this._chunks.push(chunk);
    JsonFile.save({ chunks: this._chunks }, this.logChunksPath, {
      ensureFolderExists: true,
      updateExistingFile: true
    });
  }
}
