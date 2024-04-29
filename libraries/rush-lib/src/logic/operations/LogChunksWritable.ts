// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem, JsonFile } from '@rushstack/node-core-library';
import { TerminalWritable, type ITerminalChunk } from '@rushstack/terminal';

import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { PackageNameParsers } from '../../api/PackageNameParsers';
import { RushConstants } from '../RushConstants';

export class LogChunksWritable extends TerminalWritable {
  public readonly logChunksPath: string;
  public readonly relativeLogChunksPath: string;

  private readonly _chunks: ITerminalChunk[] = [];

  public constructor(project: RushConfigurationProject, logFilenameIdentifier: string) {
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
    const unscopedProjectName: string = PackageNameParsers.permissive.getUnscopedName(project.packageName);
    const logFileBaseName: string = `${unscopedProjectName}.${logFilenameIdentifier}`;
    const logChunksFilename: string = `${logFileBaseName}.chunks.json`;

    const { projectFolder } = project;

    // If the phased commands experiment is enabled, put logs under `rush-logs`
    let logFolder: string | undefined;
    if (!isLegacyLog && project.rushConfiguration.experimentsConfiguration.configuration.phasedCommands) {
      const logPathPrefix: string = `${projectFolder}/${RushConstants.rushLogsFolderName}`;
      FileSystem.ensureFolder(logPathPrefix);
      logFolder = RushConstants.rushLogsFolderName;
    }

    const relativeLogChunksPath: string = logFolder ? `${logFolder}/${logChunksFilename}` : logChunksFilename;

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
