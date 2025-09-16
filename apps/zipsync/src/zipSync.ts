// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ITerminal } from '@rushstack/terminal/lib/ITerminal';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as zlib from 'zlib';
import { type IReadonlyPathTrieNode, LookupByPath } from '@rushstack/lookup-by-path/lib/LookupByPath';
import { crc32Builder } from './crc32';
import { DISPOSE_SYMBOL, getDisposableFileHandle, type IDisposableFileHandle } from './disposableFileHandle';
import { type IIncrementalZlib, createIncrementalZlib } from './compress';
import { markStart, markEnd, getDuration, emitSummary, formatDuration } from './perf';
import {
  writeLocalFileHeader,
  writeDataDescriptor,
  writeCentralDirectoryHeader,
  writeEndOfCentralDirectory,
  findEndOfCentralDirectory,
  parseCentralDirectoryHeader,
  getFileFromZip,
  DEFLATE_COMPRESSION,
  STORE_COMPRESSION,
  type ZipMetaCompressionMethod,
  type IEndOfCentralDirectory,
  type ICentralDirectoryHeaderParseResult,
  type IFileEntry
} from './zipUtils';

const METADATA_FILENAME: string = '__zipsync_metadata__.json';
const METADATA_VERSION: string = '1.0';

export type IZipMode = 'pack' | 'unpack';

type ZipSyncOptionCompression = 'store' | 'deflate' | 'auto';

/**
 * @public
 * Options for zipsync
 */
export interface IZipSyncOptions {
  /**
   * @rushstack/terminal compatible terminal for logging
   */
  terminal: ITerminal;
  /**
   * Mode of operation: "pack" to create a zip archive, or "unpack" to extract files from a zip archive
   */
  mode: IZipMode;
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
  /**
   * Compression mode. If set to 'deflate', file data will be compressed using raw DEFLATE (method 8) when this
   * produces a smaller result; otherwise it will fall back to 'store' per-file.
   */
  compression: ZipSyncOptionCompression;
}

interface IDirQueueItem {
  dir: string;
  depth: number;
  node?: IReadonlyPathTrieNode<boolean> | undefined;
}

interface IMetadataFileRecord {
  size: number;
  sha1Hash: string;
}

interface IMetadata {
  version: string;
  files: Record<string, IMetadataFileRecord>;
}

interface IPackResult {
  filesPacked: number;
  metadata: IMetadata;
}

interface IUnpackResult {
  metadata: IMetadata;
  filesExtracted: number;
  filesSkipped: number;
  filesDeleted: number;
  foldersDeleted: number;
  otherEntriesDeleted: number;
}

const LIKELY_COMPRESSED_EXTENSION_REGEX: RegExp =
  /\.(?:zip|gz|tgz|bz2|xz|7z|rar|jpg|jpeg|png|gif|webp|avif|mp4|m4v|mov|mkv|webm|mp3|ogg|aac|flac|pdf|woff|woff2)$/;

/**
 * Packs (creates) or unpacks (synchronizes) a ZIP archive.
 *
 * @public
 */
export function zipSync<T extends IZipSyncOptions>(
  options: T
): T['mode'] extends 'pack' ? IPackResult : IUnpackResult {
  const {
    terminal,
    mode,
    archivePath,
    targetDirectories: rawTargetDirectories,
    baseDir: rawBaseDir
  } = options;
  const baseDir: string = path.resolve(rawBaseDir);
  const targetDirectories: string[] = rawTargetDirectories.map((dir) => path.join(baseDir, dir));
  const compressionMode: ZipSyncOptionCompression = options.compression;

  function calculateSHA1(data: Buffer): string {
    return crypto.createHash('sha1').update(data).digest('hex');
  }

  function packZip(): IPackResult {
    markStart('pack.total');
    terminal.writeDebugLine('Starting packZip');
    // Pass 1: enumerate
    markStart('pack.enumerate');

    const filePaths: string[] = [];
    const queue: IDirQueueItem[] = targetDirectories.map((dir) => ({ dir, depth: 0 }));

    while (queue.length) {
      const { dir: currentDir, depth } = queue.shift()!;
      terminal.writeDebugLine(`Enumerating directory: ${currentDir}`);

      const padding: string = depth === 0 ? '' : '-↳'.repeat(depth);

      let items: fs.Dirent[];
      try {
        items = fs.readdirSync(currentDir, { withFileTypes: true });
      } catch (e) {
        if (
          e &&
          ((e as NodeJS.ErrnoException).code === 'ENOENT' || (e as NodeJS.ErrnoException).code === 'ENOTDIR')
        ) {
          terminal.writeWarningLine(`Failed to read directory: ${currentDir}. Ignoring.`);
          continue;
        } else {
          throw e;
        }
      }

      for (const item of items) {
        const fullPath: string = path.join(currentDir, item.name);
        if (item.isFile()) {
          const relativePath: string = path.relative(baseDir, fullPath).replace(/\\/g, '/');
          terminal.writeVerboseLine(`${padding}${item.name}`);
          filePaths.push(relativePath);
        } else if (item.isDirectory()) {
          terminal.writeVerboseLine(`${padding}${item.name}/`);
          queue.push({ dir: fullPath, depth: depth + 1 });
        } else {
          throw new Error(`Unexpected item (not file or directory): ${fullPath}. Aborting.`);
        }
      }
    }

    terminal.writeLine(`Found ${filePaths.length} files to pack (enumerated)`);
    markEnd('pack.enumerate');

    // Pass 2: read + hash + compress
    markStart('pack.prepareEntries');
    const bufferSize: number = 1 << 25; // 32 MiB
    const inputBuffer: Buffer<ArrayBuffer> = Buffer.allocUnsafeSlow(bufferSize);
    const outputBuffer: Buffer<ArrayBuffer> = Buffer.allocUnsafeSlow(bufferSize);

    terminal.writeDebugLine(`Opening archive for write: ${archivePath}`);
    const zipFile: number = fs.openSync(archivePath, 'w');
    let currentOffset: number = 0;
    // Use this function to do any write to the zip file, so that we can track the current offset.
    function writeChunkToZip(chunk: Uint8Array, lengthBytes: number = chunk.byteLength): void {
      let offset: number = 0;
      while (lengthBytes > 0 && offset < chunk.byteLength) {
        // In practice this call always writes all data at once, but the spec says it is not an error
        // for it to not do so. Possibly that situation comes up when writing to something that is not
        // an ordinary file.
        const written: number = fs.writeSync(zipFile, chunk, offset, lengthBytes);
        lengthBytes -= written;
        offset += written;
      }
      currentOffset += offset;
    }

    function writeFileEntry(relativePath: string): IFileEntry {
      function isLikelyAlreadyCompressed(filename: string): boolean {
        return LIKELY_COMPRESSED_EXTENSION_REGEX.test(filename.toLowerCase());
      }
      const fullPath: string = path.join(baseDir, relativePath);

      const readInputInChunks: (onChunk: (bytesInInputBuffer: number) => void) => void = (
        onChunk: (bytesInInputBuffer: number) => void
      ): void => {
        using inputDisposable: IDisposableFileHandle = getDisposableFileHandle(fullPath, 'r');

        let bytesInInputBuffer: number = 0;
        // The entire input buffer will be drained in each loop iteration
        // So run until EOF
        while (!isNaN(inputDisposable.fd)) {
          bytesInInputBuffer = fs.readSync(inputDisposable.fd, inputBuffer, 0, inputBuffer.byteLength, -1);

          if (bytesInInputBuffer <= 0) {
            // EOF, close the input fd
            inputDisposable[DISPOSE_SYMBOL]();
          }

          onChunk(bytesInInputBuffer);
        }
      };

      let shouldCompress: boolean = false;
      if (compressionMode === 'deflate') {
        shouldCompress = true;
      } else if (compressionMode === 'auto') {
        // Heuristic: skip compression for small files or likely-already-compressed files
        if (!isLikelyAlreadyCompressed(relativePath)) {
          shouldCompress = true;
        } else {
          terminal.writeVerboseLine(
            `Skip compression heuristically (already-compressed) for ${relativePath} (size unknown at this point)`
          );
        }
      }

      const compressionMethod: ZipMetaCompressionMethod = shouldCompress
        ? DEFLATE_COMPRESSION
        : STORE_COMPRESSION;

      const entry: IFileEntry = {
        filename: relativePath,
        size: 0,
        compressedSize: 0,
        crc32: 0,
        sha1Hash: '',
        localHeaderOffset: currentOffset,
        compressionMethod
      };

      writeChunkToZip(writeLocalFileHeader(entry));

      const sha1HashBuilder: crypto.Hash = crypto.createHash('sha1');
      let crc32: number = 0;
      let uncompressedSize: number = 0;
      let compressedSize: number = 0;

      using deflateIncremental: IIncrementalZlib | undefined = shouldCompress
        ? createIncrementalZlib(
            outputBuffer,
            (chunk, lengthBytes) => {
              writeChunkToZip(chunk, lengthBytes);
              compressedSize += lengthBytes;
            },
            'deflate'
          )
        : undefined;

      // Also capture content if we might need it (for compression decision or storing raw data).
      // We'll accumulate into an array of buffers to avoid repeated concatenations for large files.
      readInputInChunks((bytesInInputBuffer: number) => {
        const slice: Buffer = inputBuffer.subarray(0, bytesInInputBuffer);
        sha1HashBuilder.update(slice);
        crc32 = crc32Builder(slice, crc32);
        if (deflateIncremental) {
          deflateIncremental.update(slice);
        } else {
          writeChunkToZip(slice, bytesInInputBuffer);
        }
        uncompressedSize += bytesInInputBuffer;
      });

      // finalize hashes, compression
      deflateIncremental?.update(Buffer.alloc(0));
      crc32 = crc32 >>> 0;
      const sha1Hash: string = sha1HashBuilder.digest('hex');

      if (!shouldCompress) {
        compressedSize = uncompressedSize;
      }

      entry.size = uncompressedSize;
      entry.compressedSize = compressedSize;
      entry.crc32 = crc32;
      entry.sha1Hash = sha1Hash;

      writeChunkToZip(writeDataDescriptor(entry));

      terminal.writeVerboseLine(
        `${relativePath} (sha1=${entry.sha1Hash}, crc32=${entry.crc32.toString(16)}, size=${
          entry.size
        }, compressed=${entry.compressedSize}, method=${entry.compressionMethod}, compressed ${(
          100 -
          (entry.compressedSize / entry.size) * 100
        ).toFixed(1)}%)`
      );
      return entry;
    }

    const entries: IFileEntry[] = [];
    for (const relativePath of filePaths) {
      entries.push(writeFileEntry(relativePath));
    }

    markEnd('pack.prepareEntries');
    terminal.writeLine(`Prepared ${entries.length} file entries`);

    markStart('pack.metadata.build');
    const metadata: IMetadata = { version: METADATA_VERSION, files: {} };
    for (const entry of entries) {
      metadata.files[entry.filename] = { size: entry.size, sha1Hash: entry.sha1Hash };
    }

    const metadataContent: string = JSON.stringify(metadata);
    const metadataBuffer: Buffer = Buffer.from(metadataContent, 'utf8');
    terminal.writeDebugLine(
      `Metadata size=${metadataBuffer.length} bytes, fileCount=${Object.keys(metadata.files).length}`
    );

    let metadataCompressionMethod: ZipMetaCompressionMethod = STORE_COMPRESSION;
    let metadataData: Buffer = metadataBuffer;
    let metadataCompressedSize: number = metadataBuffer.length;
    if ((compressionMode === 'deflate' || compressionMode === 'auto') && metadataBuffer.length > 64) {
      const compressed: Buffer = zlib.deflateRawSync(metadataBuffer, { level: 9 });
      if (compressed.length < metadataBuffer.length) {
        metadataCompressionMethod = DEFLATE_COMPRESSION;
        metadataData = compressed;
        metadataCompressedSize = compressed.length;
        terminal.writeDebugLine(
          `Metadata compressed (orig=${metadataBuffer.length}, compressed=${compressed.length})`
        );
      } else {
        terminal.writeDebugLine('Metadata compression skipped (not smaller)');
      }
    }

    const metadataEntry: IFileEntry = {
      filename: METADATA_FILENAME,
      size: metadataBuffer.length,
      compressedSize: metadataCompressedSize,
      crc32: crc32Builder(metadataBuffer),
      sha1Hash: calculateSHA1(metadataBuffer),
      localHeaderOffset: currentOffset,
      compressionMethod: metadataCompressionMethod
    };

    writeChunkToZip(writeLocalFileHeader(metadataEntry));
    writeChunkToZip(metadataData, metadataCompressedSize);
    writeChunkToZip(writeDataDescriptor(metadataEntry));

    entries.push(metadataEntry);
    terminal.writeVerboseLine(`Total entries including metadata: ${entries.length}`);

    markEnd('pack.metadata.build');

    markStart('pack.write.entries');
    const outputDir: string = path.dirname(archivePath);
    fs.mkdirSync(outputDir, { recursive: true });

    try {
      markEnd('pack.write.entries');

      markStart('pack.write.centralDirectory');
      const centralDirOffset: number = currentOffset;
      let centralDirSize: number = 0;

      for (const entry of entries) {
        const centralHeader: Buffer = writeCentralDirectoryHeader(entry);
        fs.writeSync(zipFile, centralHeader);
        centralDirSize += centralHeader.length;
      }
      terminal.writeDebugLine(
        `Central directory written (offset=${centralDirOffset}, size=${centralDirSize})`
      );
      markEnd('pack.write.centralDirectory');

      // Write end of central directory
      markStart('pack.write.eocd');
      const endOfCentralDir: Buffer = writeEndOfCentralDirectory(
        centralDirOffset,
        centralDirSize,
        entries.length
      );
      fs.writeSync(zipFile, endOfCentralDir);
      terminal.writeDebugLine('EOCD record written');
      markEnd('pack.write.eocd');
    } finally {
      fs.closeSync(zipFile);
      terminal.writeDebugLine('Archive file closed');
    }
    markEnd('pack.total');
    const total: number = getDuration('pack.total');
    emitSummary('pack', terminal);
    terminal.writeLine(`Successfully packed ${entries.length} files in ${formatDuration(total)}`);
    return { filesPacked: entries.length, metadata };
  }

  function unpackZip(): IUnpackResult {
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
      const result: ICentralDirectoryHeaderParseResult = parseCentralDirectoryHeader(
        centralDirBuffer,
        offset
      );
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
      throw new Error(
        `Unsupported compression method for metadata: ${metadataEntry.header.compressionMethod}`
      );
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
            fs.unlinkSync(relativePath);
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
          fs.unlinkSync(relativePath);
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
        const stats: fs.Stats | undefined = fs.statSync(targetPath, { throwIfNoEntry: false });
        if (!stats) {
          terminal.writeDebugLine(`File does not exist and will be extracted: ${entry.filename}`);
        } else {
          const metadataFile: { size: number; sha1Hash: string } | undefined = metadata.files[entry.filename];

          if (metadataFile && stats.size === metadataFile.size) {
            const existingData: Buffer = fs.readFileSync(targetPath);
            const existingHash: string = calculateSHA1(existingData);

            if (existingHash === metadataFile.sha1Hash) {
              shouldExtract = false;
              skippedCount++;
              terminal.writeDebugLine(`Skip unchanged file: ${entry.filename}`);
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

  if (mode === 'pack') {
    terminal.writeLine(`Packing to ${archivePath} from ${rawTargetDirectories.join(', ')}`);
    return packZip() as T['mode'] extends 'pack' ? IPackResult : IUnpackResult;
  } else {
    terminal.writeLine(`Unpacking to ${rawTargetDirectories.join(', ')} from ${archivePath}`);
    return unpackZip() as T['mode'] extends 'pack' ? IPackResult : IUnpackResult;
  }
}
