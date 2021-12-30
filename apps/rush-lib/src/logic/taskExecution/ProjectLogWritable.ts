// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem, FileWriter, InternalError } from '@rushstack/node-core-library';
import { TerminalChunkKind, TerminalWritable, ITerminalChunk } from '@rushstack/terminal';
import { CollatedTerminal } from '@rushstack/stream-collator';

import { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { PackageNameParsers } from '../../api/PackageNameParsers';
import { RushConstants } from '../RushConstants';

export class ProjectLogWritable extends TerminalWritable {
  private readonly _project: RushConfigurationProject;
  private readonly _terminal: CollatedTerminal;

  private _logPath: string;
  private _errorLogPath: string;

  private _logWriter: FileWriter | undefined = undefined;
  private _errorLogWriter: FileWriter | undefined = undefined;

  public constructor(
    project: RushConfigurationProject,
    terminal: CollatedTerminal,
    logFilenameIdentifier: string
  ) {
    super();
    this._project = project;
    this._terminal = terminal;

    function getLogFilePaths(
      basePath: string,
      logFilenameIdentifier: string
    ): { logPath: string; errorLogPath: string } {
      const unscopedProjectName: string = PackageNameParsers.permissive.getUnscopedName(project.packageName);

      return {
        logPath: `${basePath}/${unscopedProjectName}.${logFilenameIdentifier}.log`,
        errorLogPath: `${basePath}/${unscopedProjectName}.${logFilenameIdentifier}.error.log`
      };
    }

    const projectFolder: string = this._project.projectFolder;
    const { logPath: legacyLogPath, errorLogPath: legacyErrorLogPath } = getLogFilePaths(
      projectFolder,
      'build'
    );
    // If the phased commands experiment is enabled, put logs under `rush-logs`
    if (project.rushConfiguration.experimentsConfiguration.configuration.phasedCommands) {
      // Delete the legacy logs
      FileSystem.deleteFile(legacyLogPath);
      FileSystem.deleteFile(legacyErrorLogPath);

      const logPathPrefix: string = `${projectFolder}/${RushConstants.rushLogsFolderName}`;
      FileSystem.ensureFolder(logPathPrefix);

      const { logPath, errorLogPath } = getLogFilePaths(logPathPrefix, logFilenameIdentifier);
      this._logPath = logPath;
      this._errorLogPath = errorLogPath;
    } else {
      this._logPath = legacyLogPath;
      this._errorLogPath = legacyErrorLogPath;
    }

    FileSystem.deleteFile(this._logPath);
    FileSystem.deleteFile(this._errorLogPath);

    this._logWriter = FileWriter.open(this._logPath);
  }

  protected onWriteChunk(chunk: ITerminalChunk): void {
    if (!this._logWriter) {
      throw new InternalError('Output file was closed');
    }
    // Both stderr and stdout get written to *.<phaseName>.log
    this._logWriter.write(chunk.text);

    if (chunk.kind === TerminalChunkKind.Stderr) {
      // Only stderr gets written to *.<phaseName>.error.log
      if (!this._errorLogWriter) {
        this._errorLogWriter = FileWriter.open(this._errorLogPath);
      }
      this._errorLogWriter.write(chunk.text);
    }
  }

  protected onClose(): void {
    if (this._logWriter) {
      try {
        this._logWriter.close();
      } catch (error) {
        this._terminal.writeStderrLine('Failed to close file handle for ' + this._logWriter.filePath);
      }
      this._logWriter = undefined;
    }

    if (this._errorLogWriter) {
      try {
        this._errorLogWriter.close();
      } catch (error) {
        this._terminal.writeStderrLine('Failed to close file handle for ' + this._errorLogWriter.filePath);
      }
      this._errorLogWriter = undefined;
    }
  }
}
