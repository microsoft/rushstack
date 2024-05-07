// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { TerminalWritable, type ITerminalChunk } from '@rushstack/terminal';
import { FileWriter } from '@rushstack/node-core-library';
import { CollatedTerminal } from '@rushstack/stream-collator';

import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { RushConstants } from '../RushConstants';
import { getRelativeLogFilePathBase } from './ProjectLogWritable';

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
 *
 */
export class LogChunksWritable extends TerminalWritable {
  public readonly logChunksPath: string;
  public readonly relativeLogChunksPath: string;

  private _chunkWriter: FileWriter;
  private readonly _terminal: CollatedTerminal;

  public constructor(
    project: RushConfigurationProject,
    terminal: CollatedTerminal,
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

    this._terminal = terminal;

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
    this._terminal.writeStderrLine('writing chunk');
    this._chunkWriter.write(JSON.stringify(chunk) + '\n');
  }

  protected onClose(): void {
    try {
      this._chunkWriter?.close();
    } catch (error) {
      this._terminal.writeStderrLine('Failed to close file handle for ' + this._chunkWriter?.filePath);
    }
  }
}
