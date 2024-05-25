// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem, FileWriter, InternalError } from '@rushstack/node-core-library';
import { TerminalChunkKind, TerminalWritable, type ITerminalChunk } from '@rushstack/terminal';
import type { CollatedTerminal } from '@rushstack/stream-collator';

import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { PackageNameParsers } from '../../api/PackageNameParsers';
import { RushConstants } from '../RushConstants';

export class ProjectLogWritable extends TerminalWritable {
  private readonly _terminal: CollatedTerminal;

  public readonly logPath: string;
  public readonly errorLogPath: string;
  public readonly logChunksPath: string;
  public readonly relativeLogPath: string;
  public readonly relativeErrorLogPath: string;
  public readonly relativeLogChunksPath: string;

  private _logWriter: FileWriter | undefined = undefined;
  private _errorLogWriter: FileWriter | undefined = undefined;

  /**
   * A new terminal stream that writes all log chunks to a JSON format so they can be faithfully reconstructed
   *  during build cache restores. This is used for adding warning + error messages in cobuilds where the original
   *  logs cannot be completely restored from the existing `all.log` and `error.log` files.
   *
   * Example output:
   * libraries/rush-lib/.rush/temp/operations/rush-lib._phase_build.chunks.jsonl
   * ```
   * {"kind":"O","text":"Invoking: heft run --only build -- --clean \n"}
   * {"kind":"O","text":" ---- build started ---- \n"}
   * {"kind":"O","text":"[build:clean] Deleted 0 files and 5 folders\n"}
   * {"kind":"O","text":"[build:typescript] Using TypeScript version 5.4.2\n"}
   * {"kind":"O","text":"[build:lint] Using ESLint version 8.57.0\n"}
   * {"kind":"E","text":"[build:lint] Warning: libraries/rush-lib/src/logic/operations/LogChunksWritable.ts:15:7 - (@typescript-eslint/typedef) Expected test to have a type annotation.\n"}
   * {"kind":"E","text":"[build:lint] Warning: libraries/rush-lib/src/logic/operations/LogChunksWritable.ts:15:7 - (@typescript-eslint/no-unused-vars) 'test' is assigned a value but never used.\n"}
   * {"kind":"O","text":"[build:typescript] Copied 1138 folders or files and linked 0 files\n"}
   * {"kind":"O","text":"[build:webpack] Using Webpack version 5.82.1\n"}
   * {"kind":"O","text":"[build:webpack] Running Webpack compilation\n"}
   * {"kind":"O","text":"[build:api-extractor] Using API Extractor version 7.43.1\n"}
   * {"kind":"O","text":"[build:api-extractor] Analysis will use the bundled TypeScript version 5.4.2\n"}
   * {"kind":"O","text":"[build:copy-mock-flush-telemetry-plugin] Copied 1260 folders or files and linked 5 files\n"}
   * {"kind":"O","text":" ---- build finished (6.856s) ---- \n"}
   * {"kind":"O","text":"-------------------- Finished (6.858s) --------------------\n"}
   * ```
   */
  private _chunkWriter: FileWriter | undefined;

  private _enableChunkedOutput: boolean;

  public constructor(
    project: RushConfigurationProject,
    terminal: CollatedTerminal,
    logFilenameIdentifier: string,
    options: {
      enableChunkedOutput?: boolean;
    } = {}
  ) {
    super();
    const { enableChunkedOutput = false } = options;
    this._terminal = terminal;

    this._enableChunkedOutput = enableChunkedOutput;

    // Delete the legacy logs
    const { logPath: legacyLogPath, errorLogPath: legacyErrorLogPath } = ProjectLogWritable.getLogFilePaths({
      project,
      logFilenameIdentifier: 'build',
      isLegacyLog: true
    });
    FileSystem.deleteFile(legacyLogPath);
    FileSystem.deleteFile(legacyErrorLogPath);

    const {
      logPath,
      errorLogPath,
      logChunksPath,
      relativeLogPath,
      relativeErrorLogPath,
      relativeLogChunksPath
    } = ProjectLogWritable.getLogFilePaths({
      project,
      logFilenameIdentifier
    });
    this.logPath = logPath;
    this.errorLogPath = errorLogPath;
    this.logChunksPath = logChunksPath;
    this.relativeLogPath = relativeLogPath;
    this.relativeErrorLogPath = relativeErrorLogPath;
    this.relativeLogChunksPath = relativeLogChunksPath;

    if (legacyLogPath !== this.logPath) {
      FileSystem.deleteFile(this.logPath);
    }

    if (legacyErrorLogPath !== this.errorLogPath) {
      FileSystem.deleteFile(this.errorLogPath);
    }

    this._logWriter = FileWriter.open(this.logPath);
    this._chunkWriter = FileWriter.open(this.logChunksPath);
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
    logChunksPath: string;
    errorLogPath: string;
    relativeLogPath: string;
    relativeErrorLogPath: string;
    relativeLogChunksPath: string;
  } {
    const logFileBaseName: string = getRelativeLogFilePathBase(
      project,
      logFilenameIdentifier,
      isLegacyLog,
      RushConstants.rushLogsFolderName
    );

    const chunkLogFileBaseName: string = getRelativeLogFilePathBase(
      project,
      logFilenameIdentifier,
      isLegacyLog,
      `.rush/${RushConstants.rushTempFolderName}/operations`
    );

    const { projectFolder } = project;
    const relativeLogPath: string = `${logFileBaseName}.log`;
    const relativeErrorLogPath: string = `${logFileBaseName}.error.log`;
    const relativeLogChunksPath: string = `${chunkLogFileBaseName}.chunks.jsonl`;

    const logPath: string = `${projectFolder}/${relativeLogPath}`;
    const errorLogPath: string = `${projectFolder}/${relativeErrorLogPath}`;
    const logChunksPath: string = `${projectFolder}/${relativeLogChunksPath}`;

    return {
      logPath,
      errorLogPath,
      logChunksPath,
      relativeLogChunksPath,
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

    if (this._enableChunkedOutput) {
      if (!this._chunkWriter) {
        throw new InternalError('Chunked output file was closed');
      }
      this._chunkWriter.write(JSON.stringify(chunk) + '\n');
    }

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

    if (this._chunkWriter) {
      try {
        this._chunkWriter.close();
      } catch (error) {
        this._terminal.writeStderrLine('Failed to close file handle for ' + this._chunkWriter.filePath);
      }
      this._chunkWriter = undefined;
    }
  }
}

function getRelativeLogFilePathBase(
  project: RushConfigurationProject,
  logFilenameIdentifier: string,
  isLegacyLog: boolean,
  phasedCommandsLogFolder?: string
): string {
  const unscopedProjectName: string = PackageNameParsers.permissive.getUnscopedName(project.packageName);
  const logFileBaseName: string = `${unscopedProjectName}.${logFilenameIdentifier}`;

  const { projectFolder } = project;

  // If the phased commands experiment is enabled, put logs under `rush-logs`
  let logFolder: string | undefined;
  if (!isLegacyLog && project.rushConfiguration.experimentsConfiguration.configuration.phasedCommands) {
    const logPathPrefix: string = `${projectFolder}/${phasedCommandsLogFolder}`;
    FileSystem.ensureFolder(logPathPrefix);
    logFolder = phasedCommandsLogFolder;
  }

  return logFolder ? `${logFolder}/${logFileBaseName}` : logFileBaseName;
}
