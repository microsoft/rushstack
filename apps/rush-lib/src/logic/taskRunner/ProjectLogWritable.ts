// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { FileSystem, FileWriter, InternalError } from '@rushstack/node-core-library';
import { TerminalChunkKind, TerminalWritable, ITerminalChunk } from '@rushstack/terminal';
import { CollatedTerminal } from '@rushstack/stream-collator';

import { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { PackageNameParsers } from '../../api/PackageNameParsers';

export class ProjectLogWritable extends TerminalWritable {
  private readonly _project: RushConfigurationProject;
  private readonly _terminal: CollatedTerminal;

  private _buildLogPath: string;
  private _errorLogPath: string;

  private _buildLogWriter: FileWriter | undefined = undefined;
  private _errorLogWriter: FileWriter | undefined = undefined;

  public constructor(project: RushConfigurationProject, terminal: CollatedTerminal) {
    super();
    this._project = project;
    this._terminal = terminal;

    const unscopedProjectName: string = PackageNameParsers.permissive.getUnscopedName(
      this._project.packageName
    );

    this._buildLogPath = path.join(this._project.projectFolder, `${unscopedProjectName}.build.log`);
    this._errorLogPath = path.join(this._project.projectFolder, `${unscopedProjectName}.build.error.log`);

    FileSystem.deleteFile(this._buildLogPath);
    FileSystem.deleteFile(this._errorLogPath);

    this._buildLogWriter = FileWriter.open(this._buildLogPath);
  }

  protected onWriteChunk(chunk: ITerminalChunk): void {
    if (!this._buildLogWriter) {
      throw new InternalError('Output file was closed');
    }
    // Both stderr and stdout get written to *.build.log
    this._buildLogWriter.write(chunk.text);

    if (chunk.kind === TerminalChunkKind.Stderr) {
      // Only stderr gets written to *.build.error.log
      if (!this._errorLogWriter) {
        this._errorLogWriter = FileWriter.open(this._errorLogPath);
      }
      this._errorLogWriter.write(chunk.text);
    }
  }

  protected onClose(): void {
    if (this._buildLogWriter) {
      try {
        this._buildLogWriter.close();
      } catch (error) {
        this._terminal.writeStderrLine('Failed to close file handle for ' + this._buildLogWriter.filePath);
      }
      this._buildLogWriter = undefined;
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
