// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as zlib from 'node:zlib';

import { type IReadonlyPathTrieNode, LookupByPath } from '@rushstack/lookup-by-path/lib/LookupByPath';
import type { ITerminal } from '@rushstack/terminal';

import { getDisposableFileHandle, unlinkSync, type IDisposableFileHandle } from './fs';
import { type IIncrementalZlib, createIncrementalZlib } from './compress';
import { markStart, markEnd, getDuration, emitSummary, formatDuration } from './perf';
import {
  findEndOfCentralDirectory,
  parseCentralDirectoryHeader,
  getFileFromZip,
  DEFLATE_COMPRESSION,
  STORE_COMPRESSION,
  type IEndOfCentralDirectory,
  type ICentralDirectoryHeaderParseResult
} from './zipUtils';
import { computeFileHash } from './hash';
import { METADATA_FILENAME, METADATA_VERSION, type IDirQueueItem, type IMetadata } from './zipSyncUtils';

/**
 * @public
 * Options for zipsync
 */
export interface IZipSyncUnpackOptions {
  /**
   * @rushstack/terminal compatible terminal for logging
   */
  terminal: ITerminal;
  /**
   * Zip file path
   */
  archivePath: string;
  /**
   * Target directories to pack or unpack (depending on mode)
   */
  targetDirectories: ReadonlyArray<string>;
  /**
   * Base directory for relative paths within the archive (defaults to common parent of targetDirectories)
   */
  baseDir: string;
}

export interface IZipSyncUnpackResult {
  metadata: IMetadata;
  filesExtracted: number;
  filesSkipped: number;
  filesDeleted: number;
  foldersDeleted: number;
  otherEntriesDeleted: number;
}

export function unpack({
  archivePath,
  targetDirectories: rawTargetDirectories,
  baseDir: rawBaseDir,
  terminal
}: IZipSyncUnpackOptions): IZipSyncUnpackResult {
  const baseDir: string = path.resolve(rawBaseDir);
  const targetDirectories: string[] = rawTargetDirectories.map((dir) => path.join(baseDir, dir));
  terminal.writeLine(`Unpacking to ${rawTargetDirectories.join(', ')} from ${archivePath}`);

  markStart('unpack.total');
  terminal.writeDebugLine('Starting unpackZip');

  markStart('unpack.read.archive');
  const zipBuffer: Buffer = fs.readFileSync(archivePath);
  terminal.writeDebugLine(`Archive size=${zipBuffer.length} bytes`);
  markEnd('unpack.read.archive');

  markStart('unpack.parse.centralDirectory');
  const zipTree: LookupByPath<boolean> = new LookupByPath();
  const endOfCentralDir: IEndOfCentralDirectory = findEndOfCentralDirectory(zipBuffer);

  const centralDirBuffer: Buffer = zipBuffer.subarray(
    endOfCentralDir.centralDirOffset,
    endOfCentralDir.centralDirOffset + endOfCentralDir.centralDirSize
  );
  terminal.writeDebugLine(
    `Central directory slice size=${centralDirBuffer.length} (expected=${endOfCentralDir.centralDirSize})`
  );

  let metadataEntry: ICentralDirectoryHeaderParseResult | undefined;
  const entries: Array<ICentralDirectoryHeaderParseResult> = [];
  let offset: number = 0;

  for (let i: number = 0; i < endOfCentralDir.totalCentralDirRecords; i++) {
    const result: ICentralDirectoryHeaderParseResult = parseCentralDirectoryHeader(centralDirBuffer, offset);
    zipTree.setItem(result.filename, true);

    if (result.filename === METADATA_FILENAME) {
      if (metadataEntry) {
        throw new Error('Multiple metadata entries found in archive');
      }
      metadataEntry = result;
    }

    entries.push(result);
    offset = result.nextOffset;
    terminal.writeDebugLine(
      `Parsed central entry ${result.filename} (method=${result.header.compressionMethod}, compSize=${result.header.compressedSize})`
    );
  }
  markEnd('unpack.parse.centralDirectory');

  if (!metadataEntry) {
    throw new Error(`Metadata entry not found in archive`);
  }

  markStart('unpack.read.metadata');
  terminal.writeDebugLine('Metadata entry found, reading');
  const metadataZipBuffer: Buffer = getFileFromZip(zipBuffer, metadataEntry);

  let metadataBuffer: Buffer;
  if (metadataEntry.header.compressionMethod === STORE_COMPRESSION) {
    metadataBuffer = metadataZipBuffer;
  } else if (metadataEntry.header.compressionMethod === DEFLATE_COMPRESSION) {
    metadataBuffer = zlib.inflateRawSync(metadataZipBuffer);
    if (metadataBuffer.length !== metadataEntry.header.uncompressedSize) {
      throw new Error(
        `Metadata size mismatch (expected ${metadataEntry.header.uncompressedSize}, got ${metadataBuffer.length})`
      );
    }
  } else {
    throw new Error(`Unsupported compression method for metadata: ${metadataEntry.header.compressionMethod}`);
  }

  const metadata: IMetadata = JSON.parse(metadataBuffer.toString('utf8')) as IMetadata;

  if (metadata.version !== METADATA_VERSION) {
    throw new Error(`Unsupported metadata version: ${metadata.version}`);
  }

  terminal.writeDebugLine(
    `Metadata (version=${metadata.version}) parsed (fileCount=${Object.keys(metadata.files).length}, rawSize=${metadataBuffer.length})`
  );
  markEnd('unpack.read.metadata');

  terminal.writeLine(`Found ${entries.length} files in archive`);

  for (const targetDirectory of targetDirectories) {
    fs.mkdirSync(targetDirectory, { recursive: true });
    terminal.writeDebugLine(`Ensured target directory: ${targetDirectory}`);
  }

  let extractedCount: number = 0;
  let skippedCount: number = 0;
  let deletedFilesCount: number = 0;
  let deletedOtherCount: number = 0;
  let deletedFoldersCount: number = 0;
  let scanCount: number = 0;

  const dirsToCleanup: string[] = [];

  markStart('unpack.scan.existing');
  const queue: IDirQueueItem[] = targetDirectories.map((dir) => ({
    dir,
    depth: 0,
    node: zipTree.getNodeAtPrefix(path.relative(baseDir, dir))
  }));

  while (queue.length) {
    const { dir: currentDir, depth, node } = queue.shift()!;
    terminal.writeDebugLine(`Enumerating directory: ${currentDir}`);

    const padding: string = depth === 0 ? '' : '-↳'.repeat(depth);

    let items: fs.Dirent[];
    try {
      items = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch (e) {
      terminal.writeWarningLine(`Failed to read directory: ${currentDir}`);
      continue;
    }

    for (const item of items) {
      scanCount++;
      // check if exists in zipTree, if not delete
      const relativePath: string = path
        .relative(baseDir, path.join(currentDir, item.name))
        .replace(/\\/g, '/');

      const childNode: IReadonlyPathTrieNode<boolean> | undefined = node?.children?.get(item.name);

      if (item.isFile()) {
        terminal.writeVerboseLine(`${padding}${item.name}`);
        if (!childNode?.value) {
          terminal.writeDebugLine(`Deleting file: ${relativePath}`);
          unlinkSync(relativePath);
          deletedFilesCount++;
        }
      } else if (item.isDirectory()) {
        terminal.writeVerboseLine(`${padding}${item.name}/`);
        queue.push({ dir: relativePath, depth: depth + 1, node: childNode });
        if (!childNode || childNode.value) {
          dirsToCleanup.push(relativePath);
        }
      } else {
        terminal.writeVerboseLine(`${padding}${item.name} (not file or directory, deleting)`);
        unlinkSync(relativePath);
        deletedOtherCount++;
      }
    }
  }

  for (const dir of dirsToCleanup) {
    // Try to remove the directory. If it is not empty, this will throw and we can ignore the error.
    try {
      fs.rmdirSync(dir);
      terminal.writeDebugLine(`Deleted empty directory: ${dir}`);
      deletedFoldersCount++;
    } catch (e) {
      // Probably not empty
      terminal.writeDebugLine(`Directory not empty, skipping: ${dir}`);
    }
  }

  terminal.writeDebugLine(`Existing entries tracked: ${scanCount}`);
  markEnd('unpack.scan.existing');

  markStart('unpack.extract.loop');
  const bufferSize: number = 1 << 25; // 32 MiB
  const outputBuffer: Buffer<ArrayBuffer> = Buffer.allocUnsafeSlow(bufferSize);

  const dirsCreated: Set<string> = new Set<string>();

  for (const entry of entries) {
    if (entry.filename === METADATA_FILENAME) {
      continue;
    }

    const targetPath: string = path.join(baseDir, entry.filename);
    const targetDir: string = path.dirname(targetPath);
    if (!dirsCreated.has(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
      dirsCreated.add(targetDir);
    }

    let shouldExtract: boolean = true;
    if (metadata) {
      const metadataFile: { size: number; sha1Hash: string } | undefined = metadata.files[entry.filename];

      if (metadataFile) {
        try {
          using existingFile: IDisposableFileHandle = getDisposableFileHandle(targetPath, 'r');
          const existingHash: string | false = computeFileHash(existingFile.fd);
          if (existingHash === metadataFile.sha1Hash) {
            shouldExtract = false;
            skippedCount++;
            terminal.writeDebugLine(`Skip unchanged file: ${entry.filename}`);
          }
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
            // File does not exist, will extract
          } else {
            throw e;
          }
        }
      }
    }

    if (shouldExtract) {
      terminal.writeDebugLine(`Extracting file: ${entry.filename}`);
      const fileZipBuffer: Buffer = getFileFromZip(zipBuffer, entry);
      let fileData: Buffer;
      using fileHandle: IDisposableFileHandle = getDisposableFileHandle(targetPath, 'w');
      if (entry.header.compressionMethod === STORE_COMPRESSION) {
        fileData = fileZipBuffer;
        let writeOffset: number = 0;
        while (writeOffset < fileData.length && !isNaN(fileHandle.fd)) {
          const written: number = fs.writeSync(
            fileHandle.fd,
            fileData,
            writeOffset,
            fileData.length - writeOffset
          );
          writeOffset += written;
        }
      } else if (entry.header.compressionMethod === DEFLATE_COMPRESSION) {
        using inflateIncremental: IIncrementalZlib = createIncrementalZlib(
          outputBuffer,
          (chunk, lengthBytes) => {
            let writeOffset: number = 0;
            while (lengthBytes > 0 && writeOffset < chunk.byteLength) {
              const written: number = fs.writeSync(fileHandle.fd, chunk, writeOffset, lengthBytes);
              lengthBytes -= written;
              writeOffset += written;
            }
          },
          'inflate'
        );
        inflateIncremental.update(fileZipBuffer);
        inflateIncremental.update(Buffer.alloc(0));
      } else {
        throw new Error(
          `Unsupported compression method: ${entry.header.compressionMethod} for ${entry.filename}`
        );
      }

      // If data descriptor was used we rely on central directory values already consumed.
      extractedCount++;
    }
  }
  markEnd('unpack.extract.loop');

  markEnd('unpack.total');
  const unpackTotal: number = getDuration('unpack.total');
  terminal.writeLine(
    `Extraction complete: ${extractedCount} extracted, ${skippedCount} skipped, ${deletedFilesCount} deleted, ${deletedFoldersCount} folders deleted, ${deletedOtherCount} other entries deleted in ${formatDuration(
      unpackTotal
    )}`
  );
  emitSummary('unpack', terminal);
  terminal.writeDebugLine('unpackZip finished');
  return {
    metadata,
    filesExtracted: extractedCount,
    filesSkipped: skippedCount,
    filesDeleted: deletedFilesCount,
    foldersDeleted: deletedFoldersCount,
    otherEntriesDeleted: deletedOtherCount
  };
}
