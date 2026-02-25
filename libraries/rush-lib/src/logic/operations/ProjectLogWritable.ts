// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem, FileWriter, InternalError, NewlineKind } from '@rushstack/node-core-library';
import {
  SplitterTransform,
  TerminalChunkKind,
  TerminalWritable,
  TextRewriterTransform,
  type ITerminalChunk
} from '@rushstack/terminal';

import type { RushConfigurationProject } from '../../api/RushConfigurationProject.ts';
import { PackageNameParsers } from '../../api/PackageNameParsers.ts';
import { RushConstants } from '../RushConstants.ts';

export interface IProjectLogWritableOptions {
  logFilePaths: ILogFilePaths;
  enableChunkedOutput?: boolean;
}

export interface ILogFileNames {
  textFileName: string;
  jsonlFileName: string;
  errorFileName: string;
}

/**
 * Information about the log files for an operation.
 *
 * @alpha
 */
export interface ILogFilePaths {
  /**
   * The absolute path to the folder containing the text log files.
   * Provided as a convenience since it is an intermediary value of producing the text log file path.
   */
  textFolder: string;
  /**
   * The absolute path to the folder containing the JSONL log files.
   * Provided as a convenience since it is an intermediary value of producing the jsonl log file path.
   */
  jsonlFolder: string;

  /**
   * The absolute path to the merged (interleaved stdout and stderr) text log.
   * ANSI escape codes have been stripped.
   */
  text: string;
  /**
   * The absolute path to the stderr text log.
   * ANSI escape codes have been stripped.
   */
  error: string;
  /**
   * The absolute path to the JSONL log. ANSI escape codes are left intact to be able to reproduce the console output.
   */
  jsonl: string;
}

export interface IGetLogFilePathsOptions {
  project: Pick<RushConfigurationProject, 'projectFolder' | 'packageName'>;
  logFilenameIdentifier: string;
}

const LOG_CHUNKS_FOLDER_RELATIVE_PATH: string = `${RushConstants.projectRushFolderName}/${RushConstants.rushTempFolderName}/chunked-rush-logs`;

/**
 * A terminal stream that writes all log chunks to a JSONL format so they can be faithfully reconstructed
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
export class JsonLFileWritable extends TerminalWritable {
  public readonly logPath: string;

  private _writer: FileWriter | undefined;

  public constructor(logPath: string) {
    super();

    this.logPath = logPath;

    this._writer = FileWriter.open(logPath);
  }

  // Override writeChunk function to throw custom error
  public override writeChunk(chunk: ITerminalChunk): void {
    if (!this._writer) {
      throw new InternalError(`Log writer was closed for ${this.logPath}`);
    }
    // Stderr can always get written to a error log writer
    super.writeChunk(chunk);
  }

  protected onWriteChunk(chunk: ITerminalChunk): void {
    if (!this._writer) {
      throw new InternalError(`Log writer was closed for ${this.logPath}`);
    }
    this._writer.write(JSON.stringify(chunk) + '\n');
  }

  protected onClose(): void {
    if (this._writer) {
      try {
        this._writer.close();
      } catch (error) {
        throw new InternalError('Failed to close file handle for ' + this._writer.filePath);
      }
      this._writer = undefined;
    }
  }
}

/**
 * A terminal stream that writes two text log files: one with interleaved stdout and stderr, and one with just stderr.
 */
export class SplitLogFileWritable extends TerminalWritable {
  public readonly logPath: string;
  public readonly errorLogPath: string;

  private _logWriter: FileWriter | undefined = undefined;
  private _errorLogWriter: FileWriter | undefined = undefined;

  public constructor(logPath: string, errorLogPath: string) {
    super();

    this.logPath = logPath;
    this.errorLogPath = errorLogPath;

    this._logWriter = FileWriter.open(logPath);
    this._errorLogWriter = undefined;
  }

  // Override writeChunk function to throw custom error
  public override writeChunk(chunk: ITerminalChunk): void {
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
        throw new InternalError('Failed to close file handle for ' + this._logWriter.filePath);
      }
      this._logWriter = undefined;
    }

    if (this._errorLogWriter) {
      try {
        this._errorLogWriter.close();
      } catch (error) {
        throw new InternalError('Failed to close file handle for ' + this._errorLogWriter.filePath);
      }
      this._errorLogWriter = undefined;
    }
  }
}

/**
 * Initializes the project log files for a project. Produces a combined log file, an error log file, and optionally a
 * chunks file that can be used to reconstrct the original console output.
 * @param options - The options to initialize the project log files.
 * @returns The terminal writable stream that will write to the log files.
 */
export async function initializeProjectLogFilesAsync(
  options: IProjectLogWritableOptions
): Promise<TerminalWritable> {
  const { logFilePaths, enableChunkedOutput = false } = options;

  const {
    textFolder: logFolderPath,
    jsonlFolder: jsonlFolderPath,
    text: logPath,
    error: errorLogPath,
    jsonl: jsonlPath
  } = logFilePaths;
  await Promise.all([
    FileSystem.ensureFolderAsync(logFolderPath),
    enableChunkedOutput && FileSystem.ensureFolderAsync(jsonlFolderPath),
    FileSystem.deleteFileAsync(logPath),
    FileSystem.deleteFileAsync(errorLogPath),
    FileSystem.deleteFileAsync(jsonlPath)
  ]);

  const splitLog: TerminalWritable = new TextRewriterTransform({
    destination: new SplitLogFileWritable(logPath, errorLogPath),
    removeColors: true,
    normalizeNewlines: NewlineKind.OsDefault
  });

  if (enableChunkedOutput) {
    const chunksFile: JsonLFileWritable = new JsonLFileWritable(jsonlPath);
    const splitter: SplitterTransform = new SplitterTransform({
      destinations: [splitLog, chunksFile]
    });
    return splitter;
  }

  return splitLog;
}

/**
 * @internal
 *
 * @param packageName - The raw package name
 * @param logFilenameIdentifier - The identifier to append to the log file name (typically the phase name)
 * @returns The base names of the log files
 */
export function getLogfileBaseNames(packageName: string, logFilenameIdentifier: string): ILogFileNames {
  const unscopedProjectName: string = PackageNameParsers.permissive.getUnscopedName(packageName);
  const logFileBaseName: string = `${unscopedProjectName}.${logFilenameIdentifier}`;

  return {
    textFileName: `${logFileBaseName}.log`,
    jsonlFileName: `${logFileBaseName}.chunks.jsonl`,
    errorFileName: `${logFileBaseName}.error.log`
  };
}

/**
 * @internal
 *
 * @param projectFolder - The absolute path of the project folder
 * @returns The absolute paths of the log folders for regular and chunked logs
 */
export function getProjectLogFolders(
  projectFolder: string
): Pick<ILogFilePaths, 'textFolder' | 'jsonlFolder'> {
  const textFolder: string = `${projectFolder}/${RushConstants.rushLogsFolderName}`;
  const jsonlFolder: string = `${projectFolder}/${LOG_CHUNKS_FOLDER_RELATIVE_PATH}`;

  return { textFolder, jsonlFolder };
}

/**
 * @internal
 *
 * @param options - The options to get the log file paths
 * @returns All information about log file paths for the project and log identifier
 */
export function getProjectLogFilePaths(options: IGetLogFilePathsOptions): ILogFilePaths {
  const {
    project: { projectFolder, packageName },
    logFilenameIdentifier
  } = options;

  const { textFolder, jsonlFolder } = getProjectLogFolders(projectFolder);
  const {
    textFileName: textLog,
    jsonlFileName: jsonlLog,
    errorFileName: errorLog
  } = getLogfileBaseNames(packageName, logFilenameIdentifier);

  const textPath: string = `${textFolder}/${textLog}`;
  const errorPath: string = `${textFolder}/${errorLog}`;
  const jsonlPath: string = `${jsonlFolder}/${jsonlLog}`;

  return {
    textFolder,
    jsonlFolder,

    text: textPath,
    error: errorPath,
    jsonl: jsonlPath
  };
}
