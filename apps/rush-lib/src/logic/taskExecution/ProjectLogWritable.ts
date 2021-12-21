// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem, FileWriter, InternalError } from '@rushstack/node-core-library';
import { TerminalChunkKind, TerminalWritable, ITerminalChunk } from '@rushstack/terminal';
import { CollatedTerminal } from '@rushstack/stream-collator';

import { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { PackageNameParsers } from '../../api/PackageNameParsers';

export class ProjectLogWritable extends TerminalWritable {
  private readonly _project: RushConfigurationProject;
  private readonly _terminal: CollatedTerminal;

  private _logPath: string;
  private _errorLogPath: string;

  private _logWriter: FileWriter | undefined = undefined;
  private _errorLogWriter: FileWriter | undefined = undefined;

  public constructor(project: RushConfigurationProject, terminal: CollatedTerminal, logFilename: string) {
    super();
    this._project = project;
    this._terminal = terminal;

    const unscopedProjectName: string = PackageNameParsers.permissive.getUnscopedName(
      this._project.packageName
    );

    this._logPath = `${this._project.projectFolder}/${unscopedProjectName}.${logFilename}.log`;
    this._errorLogPath = `${this._project.projectFolder}/${unscopedProjectName}.${logFilename}.error.log`;

    FileSystem.deleteFile(this._logPath);
    FileSystem.deleteFile(this._errorLogPath);

    this._logWriter = FileWriter.open(this._logPath);
  }

  public static normalizeNameForLogFilenames(commandName: string): string {
    return commandName.replace(/[^a-zA-Z0-9]/g, '_');
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
