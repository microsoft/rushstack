// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem, FileWriter, InternalError } from '@rushstack/node-core-library';
import { TerminalChunkKind, TerminalWritable, type ITerminalChunk } from '@rushstack/terminal';
import type { CollatedTerminal } from '@rushstack/stream-collator';

import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { PackageNameParsers } from '../../api/PackageNameParsers';
import { RushConstants } from '../RushConstants';

export interface IProjectLogWritableOptions {
  project: RushConfigurationProject;
  terminal: CollatedTerminal;
  logFilenameIdentifier: string;
  enableChunkedOutput?: boolean;
}

export interface ILogFilePaths {
  logFolderPath: string;
  logChunksFolderPath: string;

  logPath: string;
  logChunksPath: string;
  errorLogPath: string;
  relativeLogPath: string;
  relativeErrorLogPath: string;
  relativeLogChunksPath: string;
}

export interface IGetLogFilePathsOptions {
  project: RushConfigurationProject;
  logFilenameIdentifier: string;
}

const LOG_CHUNKS_FOLDER_RELATIVE_PATH: string = `${RushConstants.projectRushFolderName}/${RushConstants.rushTempFolderName}/chunked-rush-logs`;

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

  private constructor(
    terminal: CollatedTerminal,
    enableChunkedOutput: boolean,
    {
      logPath,
      errorLogPath,
      logChunksPath,
      relativeLogPath,
      relativeErrorLogPath,
      relativeLogChunksPath
    }: ILogFilePaths
  ) {
    super();
    this._terminal = terminal;
    this._enableChunkedOutput = enableChunkedOutput;

    this.logPath = logPath;
    this.errorLogPath = errorLogPath;
    this.logChunksPath = logChunksPath;
    this.relativeLogPath = relativeLogPath;
    this.relativeErrorLogPath = relativeErrorLogPath;
    this.relativeLogChunksPath = relativeLogChunksPath;

    this._logWriter = FileWriter.open(logPath);
    this._chunkWriter = FileWriter.open(logChunksPath);
  }

  public static async initializeAsync({
    project,
    terminal,
    logFilenameIdentifier,
    enableChunkedOutput = false
  }: IProjectLogWritableOptions): Promise<ProjectLogWritable> {
    const logFilePaths: ILogFilePaths = ProjectLogWritable.getLogFilePaths({
      project,
      logFilenameIdentifier
    });

    const { logFolderPath, logChunksFolderPath, logPath, errorLogPath, logChunksPath } = logFilePaths;
    await Promise.all([
      FileSystem.ensureFolderAsync(logFolderPath),
      FileSystem.ensureFolderAsync(logChunksFolderPath),
      FileSystem.deleteFileAsync(logPath),
      FileSystem.deleteFileAsync(errorLogPath),
      FileSystem.deleteFileAsync(logChunksPath)
    ]);

    return new ProjectLogWritable(terminal, enableChunkedOutput, logFilePaths);
  }

  public static getLogFilePaths({
    project: { projectFolder, packageName },
    logFilenameIdentifier
  }: IGetLogFilePathsOptions): ILogFilePaths {
    const unscopedProjectName: string = PackageNameParsers.permissive.getUnscopedName(packageName);
    const logFileBaseName: string = `${unscopedProjectName}.${logFilenameIdentifier}`;

    const logFolderPath: string = `${projectFolder}/${RushConstants.rushLogsFolderName}`;
    const logChunksFolderPath: string = `${projectFolder}/${LOG_CHUNKS_FOLDER_RELATIVE_PATH}`;

    const logFileBasePath: string = `${RushConstants.rushLogsFolderName}/${logFileBaseName}`;
    const chunkLogFileBasePath: string = `${LOG_CHUNKS_FOLDER_RELATIVE_PATH}/${logFileBaseName}`;

    const relativeLogPath: string = `${logFileBasePath}.log`;
    const relativeErrorLogPath: string = `${logFileBasePath}.error.log`;
    const relativeLogChunksPath: string = `${chunkLogFileBasePath}.chunks.jsonl`;

    const logPath: string = `${projectFolder}/${relativeLogPath}`;
    const errorLogPath: string = `${projectFolder}/${relativeErrorLogPath}`;
    const logChunksPath: string = `${projectFolder}/${relativeLogChunksPath}`;

    return {
      logFolderPath,
      logChunksFolderPath,

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
