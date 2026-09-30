// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';

import { FileSystem } from '@rushstack/node-core-library';
import { StringBufferTerminalProvider, Terminal, type ITerminal } from '@rushstack/terminal';

/**
 * The folder, under the common temp folder, that holds the sealed outputs of operations until their build cache
 * entries are written. Each process uses a subfolder named by its PID, which is empty when it has no pending writes.
 */
export const DEFERRED_CACHE_ENTRY_STAGING_FOLDER_NAME: string = 'build-cache-staging';

// How many files are cloned at once when outputs are sealed
const CLONE_CONCURRENCY: number = 16;
// How long an operation waits for its output files to be cloned. Cloning takes longer when the file system must first
// write back the data that the build just wrote, which can take seconds. The rest of the files are then cloned in the
// background.
const SEAL_WAIT_MS: number = 500;
// How many build cache entries are written at once. Each write runs tar and gzip, which use about a core each.
const WRITE_CONCURRENCY: number = 2;
// The errors with which a file system refuses to clone files. After one of them, outputs are no longer sealed.
const CLONE_UNSUPPORTED_ERROR_CODES: ReadonlySet<string> = new Set([
  'EXDEV',
  'EOPNOTSUPP',
  'ENOTSUP',
  'ENOSYS'
]);
const BYTES_PER_MB: number = 1024 * 1024;
const NANOSECONDS_PER_MICROSECOND: bigint = BigInt(1000);
const MICROSECONDS_PER_SECOND: number = 1000 * 1000;

/**
 * Output files that were cloned into a staging folder.
 */
export interface ISealedOutputs {
  /** The staging folder, which the paths of the files are relative to */
  readonly folderPath: string;
  readonly fileCount: number;
  readonly byteCount: number;
  /**
   * True if some of the files were still being cloned when the outputs were returned. They are cloned in the
   * background, and the build cache entry is written only if none of them changed before it was cloned.
   */
  readonly isSealing?: boolean;
}

export interface ISealOutputsOptions {
  /** The common temp folder of the repository, which holds the staging folder */
  readonly commonTempFolder: string;
  /** The folder that `relativePaths` are relative to */
  readonly sourceFolderPath: string;
  readonly relativePaths: ReadonlyArray<string>;
  /** Gets a line if the files can't be sealed */
  readonly terminal: ITerminal;
}

/**
 * A build cache entry to write from sealed outputs.
 */
export interface IDeferredCacheEntryWrite {
  readonly cacheId: string;
  /** The name of the operation, such as `my-project (build)` */
  readonly operationName: string;
  readonly sealedOutputs: ISealedOutputs;
  /**
   * Writes the entry from the sealed outputs. Resolves to the size of the entry in bytes, or to `undefined` if it
   * was not written, in which case its terminal output is logged. The abort signal kills tar.
   */
  readonly writeAsync: (terminal: ITerminal, abortSignal: AbortSignal) => Promise<number | undefined>;
}

export interface IDeferredCacheEntryWritesReport {
  /** Entries that were queued since the previous report */
  readonly queuedCount: number;
  /** Entries that were written since the previous report */
  readonly writtenCount: number;
  /** The total size in bytes of those entries */
  readonly writtenByteCount: number;
  /** Entries that failed to be written since the previous report */
  readonly failedCount: number;
  /**
   * Entries that were dropped since the previous report, because an output file changed before it was sealed or
   * because the writes were aborted
   */
  readonly droppedCount: number;
  /** Entries that are being sealed, queued or being written */
  readonly pendingCount: number;
}

export interface IDeferredCacheEntryWritesOptions {
  /** Clones a file. By default, this fails unless the file system can clone the file. */
  readonly cloneFileAsync?: (sourcePath: string, destinationPath: string) => Promise<void>;
  /** Whether a process with the given ID is running */
  readonly isProcessRunning?: (pid: number) => boolean;
  /** The ID of this process */
  readonly pid?: number;
  /**
   * How long `trySealAsync` waits for the files to be cloned before it lets them be cloned in the background. By
   * default, half a second.
   */
  readonly sealWaitMs?: number;
}

/**
 * A seal that went on in the background after `trySealAsync` returned.
 */
interface IBackgroundSeal {
  readonly abortController: AbortController;
  /** Resolves when the files are all cloned, and rejects if one of them changed first or couldn't be cloned */
  readonly clonePromise: Promise<void>;
  readonly startTimeMs: number;
}

/**
 * An output file, with its statistics from when the operation ended.
 */
interface ISealSource {
  readonly relativePath: string;
  readonly stats: fs.BigIntStats;
}

/**
 * The error with which a seal fails if an output file changed or was deleted before it was cloned.
 */
class OutputFileChangedError extends Error {
  public readonly relativePath: string;

  public constructor(relativePath: string) {
    super(`${relativePath} changed before it was sealed`);
    this.relativePath = relativePath;
  }
}

/**
 * Writes build cache entries in the background, for the `deferCacheWrites` setting of the Rush daemon.
 *
 * @remarks
 * When an operation completes, its output files are cloned into a staging folder. On a file system that can clone
 * files, this usually takes well under a second, even for thousands of files, because the clones share the data of
 * the files until either changes. The build cache entry is then written from the clones while the build goes on, so
 * that later changes to the output files can't change the entry. If the clones take longer, for example while the
 * file system writes back what the build just wrote, the operation stops waiting for them after half a second. The
 * rest are cloned in the background, and the entry is dropped if a file changed before it was cloned. There is one
 * instance for each process, so that the writes outlive the engine of the build that queued them.
 */
export class DeferredCacheEntryWrites {
  static #instance: DeferredCacheEntryWrites | undefined;

  readonly #cloneFileAsync: (sourcePath: string, destinationPath: string) => Promise<void>;
  readonly #isProcessRunning: (pid: number) => boolean;
  readonly #pid: number;
  readonly #sealWaitMs: number;
  readonly #queue: IDeferredCacheEntryWrite[] = [];
  readonly #runningWrites: Set<Promise<void>> = new Set();
  // The seals that went on in the background, by the path of their staging folder
  readonly #backgroundSeals: Map<string, IBackgroundSeal> = new Map();
  // The writes that were queued while their outputs were still being sealed
  readonly #sealingWrites: Set<Promise<void>> = new Set();
  // The writes from when they are queued until they are written, fail or are dropped
  readonly #pendingWrites: Set<IDeferredCacheEntryWrite> = new Set();
  // The folder of this process in each staging folder that it used, by the path of the staging folder
  readonly #processFolderPromises: Map<string, Promise<string>> = new Map();
  #abortController: AbortController = new AbortController();
  #log: ((message: string) => void) | undefined;
  #nextFolderIndex: number = 0;
  // The error with which the file system refused to clone a file, if it did
  #cloneUnsupportedErrorCode: string | undefined;
  #queuedCount: number = 0;
  #writtenCount: number = 0;
  #writtenByteCount: number = 0;
  #failedCount: number = 0;
  #droppedCount: number = 0;

  public constructor(options: IDeferredCacheEntryWritesOptions = {}) {
    this.#cloneFileAsync = options.cloneFileAsync ?? cloneFileAsync;
    this.#isProcessRunning = options.isProcessRunning ?? isProcessRunning;
    this.#pid = options.pid ?? process.pid;
    this.#sealWaitMs = options.sealWaitMs ?? SEAL_WAIT_MS;
  }

  /**
   * The instance for this process.
   */
  public static get instance(): DeferredCacheEntryWrites {
    return (DeferredCacheEntryWrites.#instance ??= new DeferredCacheEntryWrites());
  }

  /**
   * Sets the function that gets a line for each entry that is written, fails or is dropped.
   */
  public setLog(log: ((message: string) => void) | undefined): void {
    this.#log = log;
  }

  /**
   * Clones the files into a new staging folder, keeping their modes and modification times. If that takes longer
   * than half a second, the rest of the files are cloned in the background.
   *
   * @returns The staging folder, or `undefined` if the files could not be cloned. The build cache entry must then
   * be written from the files themselves.
   */
  public async trySealAsync(options: ISealOutputsOptions): Promise<ISealedOutputs | undefined> {
    const { commonTempFolder, sourceFolderPath, relativePaths, terminal } = options;
    if (this.#cloneUnsupportedErrorCode !== undefined) {
      terminal.writeVerboseLine(
        `The output files can't be cloned (${this.#cloneUnsupportedErrorCode}), so the build cache entry is written now.`
      );
      return undefined;
    }

    const startTimeMs: number = performance.now();
    let folderPath: string | undefined;
    try {
      folderPath = await this.#createStagingFolderAsync(commonTempFolder);
      // Each clone is checked against the state that its file had when the operation ended.
      const sources: ISealSource[] = await statFilesAsync(sourceFolderPath, relativePaths);
      let byteCount: number = 0;
      for (const { stats } of sources) {
        byteCount += Number(stats.size);
      }
      const abortController: AbortController = new AbortController();
      const clonePromise: Promise<void> = cloneFilesAsync(
        sourceFolderPath,
        folderPath,
        sources,
        this.#cloneFileAsync,
        abortController.signal
      );
      if (await isResolvedWithinAsync(clonePromise, this.#sealWaitMs)) {
        return { folderPath, fileCount: sources.length, byteCount };
      }
      // The write of the entry reports a failure of the seal once it is queued.
      clonePromise.catch(() => undefined);
      this.#backgroundSeals.set(folderPath, { abortController, clonePromise, startTimeMs });
      return { folderPath, fileCount: sources.length, byteCount, isSealing: true };
    } catch (error) {
      if (folderPath !== undefined) {
        await deleteFolderQuietlyAsync(folderPath);
      }
      const code: string | undefined = (error as NodeJS.ErrnoException).code;
      if (code !== undefined && CLONE_UNSUPPORTED_ERROR_CODES.has(code)) {
        this.#cloneUnsupportedErrorCode = code;
      }
      terminal.writeLine(
        `Unable to clone the output files (${code ?? (error as Error).message}), so the build cache entry is ` +
          `written now.`
      );
      return undefined;
    }
  }

  /**
   * Queues a write. It starts when its outputs are sealed and fewer than two writes are running.
   */
  public enqueue(write: IDeferredCacheEntryWrite): void {
    this.#queuedCount++;
    this.#pendingWrites.add(write);
    const backgroundSeal: IBackgroundSeal | undefined = this.#backgroundSeals.get(
      write.sealedOutputs.folderPath
    );
    if (!backgroundSeal) {
      this.#queue.push(write);
      this.#startWrites();
      return;
    }
    const sealingWrite: Promise<void> = this.#queueWhenSealedAsync(write, backgroundSeal).finally(() => {
      this.#sealingWrites.delete(sealingWrite);
    });
    this.#sealingWrites.add(sealingWrite);
  }

  /**
   * Whether a write of the build cache entry with the given ID is being sealed, is queued or is running. Such a
   * write replaces the entry when it ends.
   */
  public hasPendingWrite(cacheId: string): boolean {
    for (const write of this.#pendingWrites) {
      if (write.cacheId === cacheId) {
        return true;
      }
    }
    return false;
  }

  /**
   * Returns the counts since the previous report, and the number of pending writes.
   */
  public takeReport(): IDeferredCacheEntryWritesReport {
    const report: IDeferredCacheEntryWritesReport = {
      queuedCount: this.#queuedCount,
      writtenCount: this.#writtenCount,
      writtenByteCount: this.#writtenByteCount,
      failedCount: this.#failedCount,
      droppedCount: this.#droppedCount,
      pendingCount: this.#queue.length + this.#runningWrites.size + this.#sealingWrites.size
    };
    this.#queuedCount = 0;
    this.#writtenCount = 0;
    this.#writtenByteCount = 0;
    this.#failedCount = 0;
    this.#droppedCount = 0;
    return report;
  }

  /**
   * Resolves when no writes are being sealed, queued or running.
   */
  public async waitForIdleAsync(): Promise<void> {
    while (this.#runningWrites.size > 0 || this.#sealingWrites.size > 0) {
      await Promise.all([...this.#runningWrites, ...this.#sealingWrites]);
    }
  }

  /**
   * Drops the queued writes, stops the seals in the background, kills the tar processes of the running writes and
   * waits for them all, then deletes the staging folders of this process. Their entries are not written. Writes
   * that are queued later run as usual.
   */
  public async abortAsync(): Promise<void> {
    const droppedWrites: IDeferredCacheEntryWrite[] = this.#queue.splice(0);
    const runningWrites: Promise<void>[] = Array.from(this.#runningWrites);
    const sealingWrites: Promise<void>[] = Array.from(this.#sealingWrites);
    // Each seal stays in the map until its write is queued, and that write drops the entry.
    const backgroundSeals: IBackgroundSeal[] = Array.from(this.#backgroundSeals.values());
    for (const { abortController } of backgroundSeals) {
      abortController.abort();
    }
    this.#abortController.abort();
    this.#abortController = new AbortController();
    for (const write of droppedWrites) {
      this.#pendingWrites.delete(write);
      this.#droppedCount++;
      this.#writeLog(
        `Dropped the build cache entry ${write.cacheId} for ${write.operationName}, which was not written yet.`
      );
    }
    await Promise.all([
      ...droppedWrites.map(({ sealedOutputs }) => deleteFolderQuietlyAsync(sealedOutputs.folderPath)),
      ...runningWrites,
      ...sealingWrites,
      // The clones that are running when a seal is stopped finish first.
      ...backgroundSeals.map(({ clonePromise }) => clonePromise.catch(() => undefined))
    ]);

    const processFolderPromises: Promise<string>[] = Array.from(this.#processFolderPromises.values());
    this.#processFolderPromises.clear();
    for (const processFolderPromise of processFolderPromises) {
      try {
        await deleteFolderQuietlyAsync(await processFolderPromise);
      } catch {
        // The folder was not created.
      }
    }
  }

  async #queueWhenSealedAsync(
    write: IDeferredCacheEntryWrite,
    backgroundSeal: IBackgroundSeal
  ): Promise<void> {
    const { cacheId, operationName, sealedOutputs } = write;
    const { abortController, clonePromise, startTimeMs } = backgroundSeal;
    let sealError: { error: unknown } | undefined;
    try {
      await clonePromise;
    } catch (error) {
      sealError = { error };
    }
    this.#backgroundSeals.delete(sealedOutputs.folderPath);

    if (!sealError && !abortController.signal.aborted) {
      this.#writeLog(
        `Sealed the output files of ${operationName} in the background in ` +
          `${Math.round(performance.now() - startTimeMs)} ms.`
      );
      this.#queue.push(write);
      this.#startWrites();
      return;
    }

    this.#pendingWrites.delete(write);
    await deleteFolderQuietlyAsync(sealedOutputs.folderPath);
    const error: unknown = sealError?.error;
    if (abortController.signal.aborted) {
      this.#droppedCount++;
      this.#writeLog(
        `Dropped the build cache entry ${cacheId} for ${operationName}, which was not written yet.`
      );
    } else if (error instanceof OutputFileChangedError) {
      // The entry would hold output files that no longer exist, so this is not a failure.
      this.#droppedCount++;
      this.#writeLog(
        `Dropped the build cache entry ${cacheId} for ${operationName}, because ${error.relativePath} changed ` +
          `before it was sealed.`
      );
    } else {
      const code: string | undefined = (error as NodeJS.ErrnoException).code;
      if (code !== undefined && CLONE_UNSUPPORTED_ERROR_CODES.has(code)) {
        this.#cloneUnsupportedErrorCode = code;
      }
      this.#failedCount++;
      this.#writeLog(
        `Failed to write the build cache entry ${cacheId} for ${operationName}: Unable to clone the output ` +
          `files (${code ?? (error as Error).message}).`
      );
    }
  }

  #startWrites(): void {
    while (this.#runningWrites.size < WRITE_CONCURRENCY && this.#queue.length > 0) {
      const write: IDeferredCacheEntryWrite = this.#queue.shift()!;
      const runningWrite: Promise<void> = this.#writeAsync(write, this.#abortController.signal).finally(
        () => {
          this.#pendingWrites.delete(write);
          this.#runningWrites.delete(runningWrite);
          this.#startWrites();
        }
      );
      this.#runningWrites.add(runningWrite);
    }
  }

  async #writeAsync(write: IDeferredCacheEntryWrite, abortSignal: AbortSignal): Promise<void> {
    const { cacheId, operationName, sealedOutputs } = write;
    const startTimeMs: number = performance.now();
    const terminalProvider: StringBufferTerminalProvider = new StringBufferTerminalProvider();
    const terminal: Terminal = new Terminal(terminalProvider);
    let byteCount: number | undefined;
    try {
      byteCount = await write.writeAsync(terminal, abortSignal);
    } catch (error) {
      terminal.writeErrorLine((error as Error).message);
    } finally {
      await deleteFolderQuietlyAsync(sealedOutputs.folderPath);
    }

    const durationMs: number = Math.round(performance.now() - startTimeMs);
    if (byteCount !== undefined) {
      this.#writtenCount++;
      this.#writtenByteCount += byteCount;
      this.#writeLog(
        `Wrote the build cache entry ${cacheId} (${formatMegabytes(byteCount)}) for ${operationName} in ` +
          `${durationMs} ms.`
      );
    } else if (abortSignal.aborted) {
      this.#droppedCount++;
      this.#writeLog(
        `Dropped the build cache entry ${cacheId} for ${operationName}, which was being written.`
      );
    } else {
      this.#failedCount++;
      const output: string = [
        terminalProvider.getWarningOutput({ normalizeSpecialCharacters: false }),
        terminalProvider.getErrorOutput({ normalizeSpecialCharacters: false })
      ]
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      this.#writeLog(`Failed to write the build cache entry ${cacheId} for ${operationName}: ${output}`);
    }
  }

  #writeLog(message: string): void {
    try {
      this.#log?.(message);
    } catch {
      // A log that throws must not stop the writes.
    }
  }

  async #createStagingFolderAsync(commonTempFolder: string): Promise<string> {
    const stagingFolderPath: string = path.join(commonTempFolder, DEFERRED_CACHE_ENTRY_STAGING_FOLDER_NAME);
    let processFolderPromise: Promise<string> | undefined =
      this.#processFolderPromises.get(stagingFolderPath);
    if (!processFolderPromise) {
      processFolderPromise = this.#prepareProcessFolderAsync(stagingFolderPath);
      this.#processFolderPromises.set(stagingFolderPath, processFolderPromise);
    }
    const folderPath: string = path.join(await processFolderPromise, `${this.#nextFolderIndex++}`);
    await fs.promises.mkdir(folderPath);
    return folderPath;
  }

  async #prepareProcessFolderAsync(stagingFolderPath: string): Promise<string> {
    const processFolderPath: string = path.join(stagingFolderPath, `${this.#pid}`);
    // An earlier process with the same ID may have left files behind.
    await FileSystem.ensureEmptyFolderAsync(processFolderPath);
    // Delete the folders of processes that ended without deleting theirs, for example because they crashed.
    for (const name of await FileSystem.readFolderItemNamesAsync(stagingFolderPath)) {
      const pid: number = Number(name);
      if (/^\d+$/.test(name) && pid !== this.#pid && !this.#isProcessRunning(pid)) {
        await deleteFolderQuietlyAsync(path.join(stagingFolderPath, name));
      }
    }
    return processFolderPath;
  }
}

/**
 * Formats a number of bytes in megabytes, such as `12.3 MB`.
 */
export function formatMegabytes(byteCount: number): string {
  return `${(byteCount / BYTES_PER_MB).toFixed(1)} MB`;
}

async function cloneFileAsync(sourcePath: string, destinationPath: string): Promise<void> {
  // FICLONE_FORCE fails unless the file system clones the file, which shares its data until either copy changes.
  await fs.promises.copyFile(sourcePath, destinationPath, fs.constants.COPYFILE_FICLONE_FORCE);
}

function isProcessRunning(pid: number): boolean {
  try {
    // Signal 0 checks that the process exists, without signaling it.
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means that the process exists, but belongs to another user.
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * Gets the statistics of each output file, which must be a file.
 */
async function statFilesAsync(
  sourceFolderPath: string,
  relativePaths: ReadonlyArray<string>
): Promise<ISealSource[]> {
  const sources: ISealSource[] = new Array(relativePaths.length);
  await forEachConcurrentlyAsync(
    Array.from(relativePaths.keys()),
    async (index: number) => {
      const relativePath: string = relativePaths[index];
      const stats: fs.BigIntStats = await fs.promises.lstat(path.join(sourceFolderPath, relativePath), {
        bigint: true
      });
      if (!stats.isFile()) {
        throw new Error(`"${relativePath}" is not a file`);
      }
      sources[index] = { relativePath, stats };
    },
    undefined
  );
  return sources;
}

async function cloneFilesAsync(
  sourceFolderPath: string,
  destinationFolderPath: string,
  sources: ReadonlyArray<ISealSource>,
  cloneOneFileAsync: (sourcePath: string, destinationPath: string) => Promise<void>,
  abortSignal: AbortSignal
): Promise<void> {
  const folderPaths: Set<string> = new Set();
  for (const { relativePath } of sources) {
    folderPaths.add(path.join(destinationFolderPath, path.dirname(relativePath)));
  }
  await forEachConcurrentlyAsync(
    Array.from(folderPaths),
    async (folderPath: string) => {
      await fs.promises.mkdir(folderPath, { recursive: true });
    },
    abortSignal
  );

  await forEachConcurrentlyAsync(
    sources,
    async ({ relativePath, stats }: ISealSource) => {
      const sourcePath: string = path.join(sourceFolderPath, relativePath);
      const destinationPath: string = path.join(destinationFolderPath, relativePath);
      let cloneError: { error: unknown } | undefined;
      try {
        await cloneOneFileAsync(sourcePath, destinationPath);
      } catch (error) {
        cloneError = { error };
      }
      // A clone is a consistent copy of its file. Writing, truncating or replacing the file after its statistics
      // were taken changes its change time or its inode, so if they are the same now, the clone holds the file as it
      // was when the operation ended.
      if (!(await isUnchangedAsync(sourcePath, stats))) {
        throw new OutputFileChangedError(relativePath);
      }
      if (cloneError) {
        throw cloneError.error;
      }
      // The build cache entry has the modification time of each file. A clone has the mode of its source.
      await fs.promises.utimes(
        destinationPath,
        getSecondsForUtimes(stats.atimeNs),
        getSecondsForUtimes(stats.mtimeNs)
      );
    },
    abortSignal
  );
}

/**
 * Converts a time in nanoseconds to seconds for `utimes`, with the same whole seconds. The dates of `fs.Stats` are
 * rounded to the nearest millisecond, which moves a time in the last half millisecond of a second to the next second.
 */
export function getSecondsForUtimes(timeNs: bigint): number {
  // A number holds a count of microseconds exactly, and the quotient stays below the next whole second.
  return Number(timeNs / NANOSECONDS_PER_MICROSECOND) / MICROSECONDS_PER_SECOND;
}

async function isUnchangedAsync(filePath: string, stats: fs.BigIntStats): Promise<boolean> {
  let current: fs.BigIntStats;
  try {
    current = await fs.promises.lstat(filePath, { bigint: true });
  } catch {
    return false;
  }
  return (
    current.dev === stats.dev &&
    current.ino === stats.ino &&
    current.size === stats.size &&
    current.mtimeNs === stats.mtimeNs &&
    current.ctimeNs === stats.ctimeNs
  );
}

/**
 * Resolves to true if the promise resolves within the given time, and to false if it hasn't settled by then. Rejects
 * if the promise rejects within that time.
 */
async function isResolvedWithinAsync(promise: Promise<void>, timeoutMs: number): Promise<boolean> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise.then(() => true),
      new Promise<boolean>((resolve) => {
        timeout = setTimeout(() => resolve(false), timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Calls the callback for each item, for up to 16 items at once. Unlike `Async.forEachAsync`, it waits for the
 * callbacks that are running when one fails or the signal is aborted, so that the caller can delete what they
 * created.
 */
async function forEachConcurrentlyAsync<T>(
  items: ReadonlyArray<T>,
  callbackAsync: (item: T) => Promise<void>,
  abortSignal: AbortSignal | undefined
): Promise<void> {
  let nextIndex: number = 0;
  let failure: { error: unknown } | undefined;
  const workAsync = async (): Promise<void> => {
    while (!failure && !abortSignal?.aborted && nextIndex < items.length) {
      const item: T = items[nextIndex++];
      try {
        await callbackAsync(item);
      } catch (error) {
        failure ??= { error };
      }
    }
  };
  const workerCount: number = Math.min(CLONE_CONCURRENCY, items.length);
  await Promise.all(Array.from({ length: workerCount }, workAsync));
  if (failure) {
    throw failure.error;
  }
  if (abortSignal?.aborted) {
    throw new Error('The seal was stopped.');
  }
}

async function deleteFolderQuietlyAsync(folderPath: string): Promise<void> {
  try {
    await FileSystem.deleteFolderAsync(folderPath);
  } catch {
    // It is deleted with the other staging folders of this process when they are aborted, or by the next process
    // with the same ID.
  }
}
