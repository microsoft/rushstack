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

  public readonly logPath: string;
  public readonly errorLogPath: string;
  public readonly relativeLogPath: string;
  public readonly relativeErrorLogPath: string;

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

    // Delete the legacy logs
    const { logPath: legacyLogPath, errorLogPath: legacyErrorLogPath } = ProjectLogWritable.getLogFilePaths({
      project,
      logFilenameIdentifier: 'build',
      isLegacyLog: true
    });
    FileSystem.deleteFile(legacyLogPath);
    FileSystem.deleteFile(legacyErrorLogPath);

    const { logPath, errorLogPath, relativeLogPath, relativeErrorLogPath } =
      ProjectLogWritable.getLogFilePaths({
        project,
        logFilenameIdentifier
      });
    this.logPath = logPath;
    this.errorLogPath = errorLogPath;
    this.relativeLogPath = relativeLogPath;
    this.relativeErrorLogPath = relativeErrorLogPath;

    if (legacyLogPath !== this.logPath) {
      FileSystem.deleteFile(this.logPath);
    }

    if (legacyErrorLogPath !== this.errorLogPath) {
      FileSystem.deleteFile(this.errorLogPath);
    }

    this._logWriter = FileWriter.open(this.logPath);
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
    logPath: string;
    errorLogPath: string;
    relativeLogPath: string;
    relativeErrorLogPath: string;
  } {
    const unscopedProjectName: string = PackageNameParsers.permissive.getUnscopedName(project.packageName);
    const logFileBaseName: string = `${unscopedProjectName}.${logFilenameIdentifier}`;
    const logFilename: string = `${logFileBaseName}.log`;
    const errorLogFilename: string = `${logFileBaseName}.error.log`;

    const { projectFolder } = project;

    // If the phased commands experiment is enabled, put logs under `rush-logs`
    let logFolder: string | undefined;
    if (!isLegacyLog && project.rushConfiguration.experimentsConfiguration.configuration.phasedCommands) {
      const logPathPrefix: string = `${projectFolder}/${RushConstants.rushLogsFolderName}`;
      FileSystem.ensureFolder(logPathPrefix);
      logFolder = RushConstants.rushLogsFolderName;
    }

    const relativeLogPath: string = logFolder ? `${logFolder}/${logFilename}` : logFilename;
    const relativeErrorLogPath: string = logFolder ? `${logFolder}/${errorLogFilename}` : errorLogFilename;

    const logPath: string = `${projectFolder}/${relativeLogPath}`;
    const errorLogPath: string = `${projectFolder}/${relativeErrorLogPath}`;

    return {
      logPath,
      errorLogPath,
      relativeLogPath,
      relativeErrorLogPath
    };
  }

  // Override writeChunk function to throw custom error
  public writeChunk(chunk: ITerminalChunk): void {
    if (!this._logWriter) {
      throw new InternalError(`Log writer was closed for ${this.logPath}`);
    }
    // Stderr can always get written to a error log writer
    super.writeChunk(chunk);
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
        this._errorLogWriter = FileWriter.open(this.errorLogPath);
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
