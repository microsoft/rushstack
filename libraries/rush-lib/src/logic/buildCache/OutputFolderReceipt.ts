// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { createHash, randomBytes, type Hash } from 'node:crypto';
import * as fs from 'node:fs';
import { appendFile, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import * as path from 'node:path';

import { Async, FileSystem } from '@rushstack/node-core-library';

const RECEIPT_VERSION: 1 = 1;
const STAMP_MAX_WAIT_MS: number = 100;
const STAMP_RETRY_DELAY_MS: number = 1;
const STAMP_BYTE: Uint8Array = new Uint8Array(1);

/**
 * A time on the file system clock. A file or folder that last changed before the stamp was taken has modification
 * and status change times earlier than the stamp. One that changes afterwards gets times at or after the stamp.
 */
export interface IOutputFolderStamp {
  /**
   * The time, in nanoseconds.
   */
  readonly timeNs: bigint;
  /**
   * The device of the file that the stamp was taken from. Times on another device may come from another clock.
   */
  readonly dev: bigint;
}

/**
 * The files and folders in the output folders of an operation.
 */
export interface IOutputFolderListing {
  /**
   * Covers the path, device, identity and mode of every file and folder, and the size, modification time and status
   * change time of every file. Any change to a file's content changes its status change time.
   */
  readonly digest: string;
  /**
   * The project-relative paths of the files, sorted, in the form that the build cache archives them.
   */
  readonly files: ReadonlyArray<string>;
  /**
   * If defined, a receipt must not certify the listing, and this says why: a restore from the build cache would not
   * leave the same tree, or (if the listing was given a stamp) something changed at or after the stamp.
   */
  readonly uncertifiableReason: string | undefined;
}

/**
 * The options for {@link OutputFolderReceipt.tryCreate}.
 */
export interface IOutputFolderReceiptOptions {
  /**
   * The absolute path of the project folder.
   */
  projectFolder: string;
  /**
   * The absolute path of the project's `.rush/temp` folder, where the receipt is written.
   */
  projectRushTempFolder: string;
  /**
   * Identifies the operation, e.g. `_phase_build`.
   */
  logFilenameIdentifier: string;
  /**
   * The project-relative output folders of the operation, including its metadata folder.
   */
  outputFolderNames: ReadonlyArray<string>;
}

interface IOutputFolderReceiptJson {
  version: number;
  cacheId: string;
  outputFolderNames: string[];
  listingDigest: string;
}

/**
 * Whether a file or folder may have changed at or after the stamp. If it did, a later change within the same clock
 * tick would not change its times.
 */
export function isNewerThanStamp(
  stats: Pick<fs.BigIntStats, 'dev' | 'mtimeNs' | 'ctimeNs'>,
  stamp: IOutputFolderStamp
): boolean {
  return stats.dev !== stamp.dev || stats.mtimeNs >= stamp.timeNs || stats.ctimeNs >= stamp.timeNs;
}

/**
 * Creates a file and takes a stamp from it. It waits until the file system clock has moved past the file's creation,
 * so every file that changed before this call has times strictly earlier than the stamp, even on a file system with
 * coarse timestamps.
 *
 * @param filePath - The file to create. It must not exist. It is left in place, for the caller to reuse or delete.
 * @returns The stamp, or `undefined` if the clock didn't move within 100 ms.
 */
export async function createStampAsync(filePath: string): Promise<IOutputFolderStamp | undefined> {
  await writeFile(filePath, '', { flag: 'wx' });
  const created: fs.BigIntStats = await stat(filePath, { bigint: true });
  const createdNs: bigint = created.mtimeNs > created.ctimeNs ? created.mtimeNs : created.ctimeNs;
  const deadline: number = Date.now() + STAMP_MAX_WAIT_MS;
  do {
    // Each write closes its handle before the file is stat'ed: on Windows, a file's times are only certain to be
    // current once the handle that changed it is closed.
    await appendFile(filePath, STAMP_BYTE);
    const stats: fs.BigIntStats = await stat(filePath, { bigint: true });
    const timeNs: bigint = stats.mtimeNs < stats.ctimeNs ? stats.mtimeNs : stats.ctimeNs;
    if (timeNs > createdNs) {
      return { timeNs, dev: stats.dev };
    }
    await Async.sleepAsync(STAMP_RETRY_DELAY_MS);
  } while (Date.now() < deadline);
  return undefined;
}

/**
 * Lists the files and folders in the output folders of an operation, in the same order and form as the build cache
 * collects them. A symbolic link or other special file, a folder with no file under it, or an entry that is deleted
 * or replaced while it is listed makes the listing uncertifiable.
 *
 * @param projectFolder - The absolute path of the project folder
 * @param outputFolderNames - The project-relative output folders of the operation
 * @param stamp - If given, an entry that is newer than the stamp makes the listing uncertifiable
 */
export async function listOutputFoldersAsync(
  projectFolder: string,
  outputFolderNames: ReadonlyArray<string>,
  stamp?: IOutputFolderStamp
): Promise<IOutputFolderListing> {
  const entries: string[] = [];
  const files: string[] = [];
  let uncertifiableReason: string | undefined;

  // Adds the entry, and returns whether it's a file or a folder, or undefined if the listing is uncertifiable.
  function addEntry(relativePath: string, stats: fs.BigIntStats | undefined): 'file' | 'folder' | undefined {
    if (!stats) {
      uncertifiableReason = `"${relativePath}" was deleted while it was listed`;
    } else if (stamp && isNewerThanStamp(stats, stamp)) {
      uncertifiableReason = `"${relativePath}" changed while the receipt was being written`;
    } else if (stats.isDirectory()) {
      entries.push(`d ${relativePath} ${stats.dev} ${stats.ino} ${stats.mode}`);
      return 'folder';
    } else if (stats.isFile()) {
      entries.push(
        `f ${relativePath} ${stats.dev} ${stats.ino} ${stats.size} ${stats.mode} ${stats.mtimeNs} ${stats.ctimeNs}`
      );
      files.push(relativePath);
      return 'file';
    } else {
      uncertifiableReason = `"${relativePath}" is a symbolic link or another special file`;
    }
    return undefined;
  }

  // Lists a folder's children, and returns the number of files under it.
  async function listFolderAsync(relativePath: string, diskPath: string): Promise<number> {
    let children: fs.Dirent[];
    try {
      children = await readdir(diskPath, { withFileTypes: true });
    } catch (error) {
      if (!FileSystem.isNotExistError(error as Error)) {
        throw error;
      }
      uncertifiableReason = `"${relativePath}" was deleted or replaced while it was listed`;
      return 0;
    }

    let fileCount: number = 0;
    for (const { name } of children) {
      const childRelativePath: string = `${relativePath}/${name}`;
      const childDiskPath: string = `${diskPath}/${name}`;
      const childStats: fs.BigIntStats | undefined = fs.lstatSync(childDiskPath, {
        bigint: true,
        throwIfNoEntry: false
      });
      const kind: 'file' | 'folder' | undefined = addEntry(childRelativePath, childStats);
      if (kind === 'file') {
        fileCount++;
      } else if (kind === 'folder') {
        fileCount += await listFolderAsync(childRelativePath, childDiskPath);
      }
      if (uncertifiableReason) {
        return fileCount;
      }
    }

    if (fileCount === 0) {
      // The build cache archives only files, so a restore would not recreate this folder.
      uncertifiableReason = `"${relativePath}" has no files in it`;
    }
    return fileCount;
  }

  for (const folderName of outputFolderNames) {
    const diskPath: string = `${projectFolder}/${folderName}`;
    const stats: fs.BigIntStats | undefined = fs.lstatSync(diskPath, { bigint: true, throwIfNoEntry: false });
    if (!stats) {
      entries.push(`missing ${folderName}`);
    } else if (!stats.isDirectory()) {
      uncertifiableReason = `"${folderName}" is not a folder`;
    } else if (addEntry(folderName, stats)) {
      await listFolderAsync(folderName, diskPath);
    }
    if (uncertifiableReason) {
      break;
    }
  }

  entries.sort();
  files.sort();
  const hash: Hash = createHash('sha1');
  for (const entry of entries) {
    // File names can't contain a NUL character, so entries can't run into each other.
    hash.update(entry);
    hash.update('\0');
  }

  return { digest: hash.digest('hex'), files, uncertifiableReason };
}

interface IPendingOutputFolderReceiptOptions {
  filePath: string;
  tempFilePath: string;
  projectFolder: string;
  outputFolderNames: ReadonlyArray<string>;
  stamp: IOutputFolderStamp | undefined;
}

/**
 * A receipt that has its stamp and its temporary file, and hasn't been written yet.
 */
export class PendingOutputFolderReceipt {
  readonly #options: IPendingOutputFolderReceiptOptions;
  #isCommitted: boolean = false;

  public constructor(options: IPendingOutputFolderReceiptOptions) {
    this.#options = options;
  }

  /**
   * Lists the output folders and writes the receipt, unless the listing is uncertifiable or its files are not the
   * files in the cache entry.
   *
   * @param cacheId - The cache entry that the output folders hold
   * @param archivedFilePaths - The files in the cache entry, if it was just written from the output folders
   * @returns `undefined` if the receipt was written, or else why not
   */
  public async tryCommitAsync(
    cacheId: string,
    archivedFilePaths?: ReadonlyArray<string>
  ): Promise<string | undefined> {
    const { filePath, tempFilePath, projectFolder, outputFolderNames, stamp } = this.#options;
    if (!stamp) {
      return 'the file system clock did not advance';
    }

    const listing: IOutputFolderListing = await listOutputFoldersAsync(
      projectFolder,
      outputFolderNames,
      stamp
    );
    if (listing.uncertifiableReason !== undefined) {
      return listing.uncertifiableReason;
    }
    if (archivedFilePaths && !areArraysEqual(listing.files, archivedFilePaths)) {
      return 'the output folders do not hold the same files as the cache entry';
    }

    const receipt: IOutputFolderReceiptJson = {
      version: RECEIPT_VERSION,
      cacheId,
      outputFolderNames: [...outputFolderNames],
      listingDigest: listing.digest
    };
    await writeFile(tempFilePath, JSON.stringify(receipt, undefined, 2));
    await rename(tempFilePath, filePath);
    this.#isCommitted = true;
    return undefined;
  }

  /**
   * Deletes the temporary file, unless the receipt was written.
   */
  public async disposeAsync(): Promise<void> {
    if (!this.#isCommitted) {
      await deleteFileIfExistsAsync(this.#options.tempFilePath);
    }
  }
}

/**
 * A file in the project's `.rush/temp` folder that says: the output folders of this operation hold exactly the files
 * of this build cache entry. The build cache writes it after it restores or writes the entry, and trusts it only if
 * the output folders are listed again with the same result. It never needs to be deleted when the outputs change:
 * any change to a file or folder that it lists gives that entry a status change time at or after the receipt's stamp,
 * which is later than every time in the receipt.
 */
export class OutputFolderReceipt {
  /**
   * The path of the receipt file.
   */
  public readonly filePath: string;
  readonly #projectFolder: string;
  readonly #outputFolderNames: ReadonlyArray<string>;

  private constructor(filePath: string, projectFolder: string, outputFolderNames: ReadonlyArray<string>) {
    this.filePath = filePath;
    this.#projectFolder = projectFolder;
    this.#outputFolderNames = outputFolderNames;
  }

  /**
   * Returns the receipt for an operation's output folders, or `undefined` if it can't have one: if one of its
   * output folders contains the project's `.rush/temp` folder, or if a folder name is absolute or contains `..`.
   */
  public static tryCreate(options: IOutputFolderReceiptOptions): OutputFolderReceipt | undefined {
    const { projectFolder, projectRushTempFolder, logFilenameIdentifier, outputFolderNames } = options;
    if (!logFilenameIdentifier) {
      return undefined;
    }

    const filePath: string = path.join(
      projectRushTempFolder,
      `build-cache-receipt_${logFilenameIdentifier}.json`
    );
    for (const folderName of outputFolderNames) {
      if (path.isAbsolute(folderName) || folderName.split(/[\\/]/).includes('..')) {
        return undefined;
      }
      const folderPath: string = path.resolve(projectFolder, folderName);
      if (
        isInFolder(projectRushTempFolder, folderPath) ||
        folderPath.toLowerCase().startsWith(filePath.toLowerCase())
      ) {
        return undefined;
      }
    }

    return new OutputFolderReceipt(filePath, projectFolder, [...outputFolderNames]);
  }

  /**
   * Whether the receipt says that the output folders hold exactly the given cache entry, and a new listing of the
   * output folders matches the receipt's.
   */
  public async isMatchAsync(cacheId: string): Promise<boolean> {
    let json: string;
    try {
      json = await readFile(this.filePath, 'utf8');
    } catch (error) {
      if (FileSystem.isNotExistError(error as Error)) {
        return false;
      }
      throw error;
    }

    const receipt: Partial<IOutputFolderReceiptJson> | undefined = tryParseReceipt(json);
    if (
      receipt?.version !== RECEIPT_VERSION ||
      receipt.cacheId !== cacheId ||
      !areArraysEqual(receipt.outputFolderNames, this.#outputFolderNames)
    ) {
      return false;
    }

    const listing: IOutputFolderListing = await listOutputFoldersAsync(
      this.#projectFolder,
      this.#outputFolderNames
    );
    return listing.uncertifiableReason === undefined && listing.digest === receipt.listingDigest;
  }

  /**
   * Deletes the receipt, if it exists.
   */
  public async deleteAsync(): Promise<void> {
    await deleteFileIfExistsAsync(this.filePath);
  }

  /**
   * Starts a new receipt by taking its stamp. Call it before the step whose result the receipt will describe starts
   * to read or write the output folders, and dispose of the result when that step is done.
   */
  public async beginAsync(): Promise<PendingOutputFolderReceipt> {
    await FileSystem.ensureFolderAsync(path.dirname(this.filePath));
    const tempFilePath: string = `${this.filePath}.${randomBytes(8).toString('hex')}.tmp`;
    let stamp: IOutputFolderStamp | undefined;
    try {
      stamp = await createStampAsync(tempFilePath);
    } catch (error) {
      await deleteFileIfExistsAsync(tempFilePath);
      throw error;
    }
    return new PendingOutputFolderReceipt({
      filePath: this.filePath,
      tempFilePath,
      projectFolder: this.#projectFolder,
      outputFolderNames: this.#outputFolderNames,
      stamp
    });
  }
}

function tryParseReceipt(json: string): Partial<IOutputFolderReceiptJson> | undefined {
  try {
    const value: unknown = JSON.parse(json);
    return typeof value === 'object' && value !== null
      ? (value as Partial<IOutputFolderReceiptJson>)
      : undefined;
  } catch {
    return undefined;
  }
}

function areArraysEqual(array1: ReadonlyArray<unknown> | undefined, array2: ReadonlyArray<unknown>): boolean {
  return (
    Array.isArray(array1) &&
    array1.length === array2.length &&
    array1.every((value: unknown, index: number) => value === array2[index])
  );
}

// Whether the path is the folder or inside it. Compared without case, since the file system may ignore it.
function isInFolder(childPath: string, folderPath: string): boolean {
  const relativePath: string = path.relative(folderPath.toLowerCase(), childPath.toLowerCase());
  return !(
    relativePath === '..' ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  );
}

async function deleteFileIfExistsAsync(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch (error) {
    if (!FileSystem.isNotExistError(error as Error)) {
      throw error;
    }
  }
}
