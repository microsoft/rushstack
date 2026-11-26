// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import type { ChildProcess } from 'node:child_process';
import events from 'node:events';

import { Executable, FileSystem, FileWriter } from '@rushstack/node-core-library';
import type { ITerminal } from '@rushstack/terminal';

const initializations: Map<string | undefined, Promise<TarExecutable | undefined>> = new Map();

/**
 * @beta
 */
export interface ITarOptionsBase {
  logFilePath: string;
}

/**
 * @beta
 */
export interface IUntarOptions extends ITarOptionsBase {
  archivePath: string;
  outputFolderPath: string;
}

/**
 * @beta
 */
export interface ICreateArchiveOptions extends ITarOptionsBase {
  archivePath: string;
  paths: string[];
  /** The folder that `paths` are relative to. */
  baseFolderPath: string;
  /** Whether to compress the archive with gzip. Defaults to true. */
  gzip?: boolean;
  /** When aborted, kills the tar process, which then exits with a nonzero code. */
  abortSignal?: AbortSignal;
}

/**
 * Shared native tar discovery and execution for deployment and build caching.
 * @beta
 */
export class TarExecutable {
  #tarExecutablePath: string;

  private constructor(tarExecutablePath: string) {
    this.#tarExecutablePath = tarExecutablePath;
  }

  public static async tryInitializeAsync(
    terminal: ITerminal,
    tarBinaryPath?: string
  ): Promise<TarExecutable | undefined> {
    let initialization: Promise<TarExecutable | undefined> | undefined = initializations.get(tarBinaryPath);
    if (!initialization) {
      initialization = (async () => {
        terminal.writeVerboseLine('Trying to find "tar" binary');
        const tarExecutablePath: string | undefined =
          tarBinaryPath || (await _tryFindTarExecutablePathAsync());
        if (!tarExecutablePath) {
          terminal.writeVerboseLine('"tar" was not found on the PATH');
          return undefined;
        } else {
          terminal.writeVerboseLine(`Using "tar" binary: ${tarExecutablePath}`);
          return new TarExecutable(tarExecutablePath);
        }
      })();
      initializations.set(tarBinaryPath, initialization);
    }

    return await initialization;
  }

  /**
   * @returns
   * The "tar" exit code
   */
  public async tryUntarAsync(options: IUntarOptions): Promise<number> {
    const { archivePath, outputFolderPath, logFilePath } = options;
    return await this.#spawnTarWithLoggingAsync(
      // These parameters are chosen for compatibility with the very primitive bsdtar 3.3.2 shipped with Windows 10.
      [
        // [Windows bsdtar 3.3.2] Extract: tar -x [options] [<patterns>]
        '-x',
        // [Windows bsdtar 3.3.2] -m    Don't restore modification times
        '-m',
        // [Windows bsdtar 3.3.2] -f <filename>  Location of archive (default \\.\tape0)
        '-f',
        archivePath
      ],
      outputFolderPath,
      logFilePath
    );
  }

  /**
   * @returns
   * The "tar" exit code
   */
  public async tryCreateArchiveAsync(options: ICreateArchiveOptions): Promise<number> {
    const { archivePath, paths, logFilePath, baseFolderPath, abortSignal, gzip = true } = options;

    const tarInput: string = paths.length > 0 ? `${paths.join('\0')}\0` : '';

    // On Windows, tar.exe will report a "Failed to clean up compressor" error if the target folder
    // does not exist (GitHub #2622)
    await FileSystem.ensureFolderAsync(path.dirname(archivePath));

    const tarExitCode: number = await this.#spawnTarWithLoggingAsync(
      // These parameters are chosen for compatibility with the very primitive bsdtar 3.3.2 shipped with Windows 10.
      [
        // [Windows bsdtar 3.3.2] -c Create
        '-c',
        // [Windows bsdtar 3.3.2] -f <filename>  Location of archive (default \\.\tape0)
        '-f',
        archivePath,
        // [Windows bsdtar 3.3.2] -z, -j, -J, --lzma  Compress archive with gzip/bzip2/xz/lzma
        ...(gzip ? ['-z'] : []),
        // NUL-delimited lists preserve whitespace and treat leading dashes as filenames.
        '--null',
        // [GNU tar 1.33] -T, --files-from=FILE      get names to extract or create from FILE
        //
        // Windows bsdtar does not document this parameter, but seems to accept it.
        '--files-from=-'
      ],
      baseFolderPath,
      logFilePath,
      tarInput,
      abortSignal
    );

    return tarExitCode;
  }

  async #spawnTarWithLoggingAsync(
    args: string[],
    currentWorkingDirectory: string,
    logFilePath: string,
    input?: string,
    abortSignal?: AbortSignal
  ): Promise<number> {
    // Runs "tar" with the specified args and logs its output to the specified location.
    // The log file looks like this:
    //
    // Windows:
    // Start time: Mon Apr 19 2021 13:06:40 GMT-0700 (Pacific Daylight Time)
    // Invoking "C:\WINDOWS\system32\tar.exe -x -f E:\rush-cache\d18105f7f83eb610b468be4e2421681f4a52e44d"
    //
    // ======= BEGIN PROCESS OUTPUT =======
    // [stdout] <tar stdout output>
    // [stderr] <tar stderr output>
    // ======== END PROCESS OUTPUT ========
    //
    // Exited with code "0"
    //
    // Linux:
    // Start time: Mon Apr 19 2021 13:06:40 GMT-0700 (Pacific Daylight Time)
    // Invoking "/bin/tar -x -f /home/username/rush-cache/d18105f7f83eb610b468be4e2421681f4a52e44d"
    //
    // ======= BEGIN PROCESS OUTPUT =======
    // [stdout] <tar stdout output>
    // [stderr] <tar stderr output>
    // ======== END PROCESS OUTPUT ========
    //
    // Exited with code "0"

    await FileSystem.ensureFolderAsync(path.dirname(logFilePath));
    const fileWriter: FileWriter = FileWriter.open(logFilePath);
    fileWriter.write(
      [
        `Start time: ${new Date().toString()}`,
        `Invoking "${this.#tarExecutablePath} ${args.join(' ')}"`,
        '',
        `======= BEGIN PROCESS INPUT ======`,
        input || '',
        '======== END PROCESS INPUT =======',
        '======= BEGIN PROCESS OUTPUT =======',
        ''
      ].join('\n')
    );

    const childProcess: ChildProcess = Executable.spawn(this.#tarExecutablePath, args, {
      currentWorkingDirectory: currentWorkingDirectory
    });
    const kill: () => void = () => childProcess.kill();
    if (abortSignal?.aborted) {
      kill();
    } else {
      abortSignal?.addEventListener('abort', kill, { once: true });
    }

    childProcess.stdout!.on('data', (chunk) => fileWriter.write(`[stdout] ${chunk}`));
    childProcess.stderr!.on('data', (chunk) => fileWriter.write(`[stderr] ${chunk}`));

    if (input !== undefined) {
      childProcess.stdin!.on('error', (error: NodeJS.ErrnoException) => {
        // An incompatible or aborted tar may exit before reading the file list.
        if (error.code === 'EPIPE' || error.code === 'EOF') {
          fileWriter.write(`[stdin] ${error.message}\n`);
        } else {
          childProcess.emit('error', error);
        }
      });

      childProcess.stdin!.write(input, 'utf-8');
      childProcess.stdin!.end();
    }

    // Wait for process to exit and all streams to close
    let tarExitCode: number | null;
    let tarSignal: NodeJS.Signals | null;
    try {
      [tarExitCode, tarSignal] = await events.once(childProcess, 'close');
    } finally {
      abortSignal?.removeEventListener('abort', kill);
    }

    fileWriter.write(
      ['======== END PROCESS OUTPUT ========', '', `Exited with code "${tarExitCode ?? tarSignal}"`].join(
        '\n'
      )
    );
    fileWriter.close();

    // A tar process that was killed has no exit code.
    return tarExitCode ?? 1;
  }
}

async function _tryFindTarExecutablePathAsync(): Promise<string | undefined> {
  if (process.platform === 'win32') {
    // If we're running on Windows, first try to use the OOB tar executable. If
    // we're running in the Git Bash, the tar executable on the PATH doesn't handle
    // Windows file paths correctly.
    // eslint-disable-next-line dot-notation
    const windowsFolderPath: string | undefined = process.env['WINDIR'];
    if (windowsFolderPath) {
      const defaultWindowsTarExecutablePath: string = `${windowsFolderPath}\\system32\\tar.exe`;
      if (await FileSystem.existsAsync(defaultWindowsTarExecutablePath)) {
        return defaultWindowsTarExecutablePath;
      }
    }
  }

  return Executable.tryResolve('tar');
}
