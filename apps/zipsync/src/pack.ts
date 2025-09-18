// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import * as zlib from 'node:zlib';

import type { ITerminal } from '@rushstack/terminal/lib/ITerminal';

import { crc32Builder } from './crc32';
import { DISPOSE_SYMBOL, getDisposableFileHandle, type IDisposableFileHandle } from './fs';
import { type IIncrementalZlib, type IncrementalZlibMode, createIncrementalZlib } from './compress';
import { markStart, markEnd, getDuration, emitSummary, formatDuration } from './perf';
import {
  writeLocalFileHeader,
  writeDataDescriptor,
  writeCentralDirectoryHeader,
  writeEndOfCentralDirectory,
  ZSTD_COMPRESSION,
  DEFLATE_COMPRESSION,
  STORE_COMPRESSION,
  type ZipMetaCompressionMethod,
  type IFileEntry,
  dosDateTime
} from './zipUtils';
import { calculateSHA1 } from './hash';
import {
  type ZipSyncOptionCompression,
  type IMetadata,
  type IDirQueueItem,
  METADATA_VERSION,
  METADATA_FILENAME
} from './zipSyncUtils';

const LIKELY_COMPRESSED_EXTENSION_REGEX: RegExp =
  /\.(?:zip|gz|tgz|bz2|xz|7z|rar|jpg|jpeg|png|gif|webp|avif|mp4|m4v|mov|mkv|webm|mp3|ogg|aac|flac|pdf|woff|woff2)$/;

const zlibPackModes: Record<ZipMetaCompressionMethod, IncrementalZlibMode | undefined> = {
  [ZSTD_COMPRESSION]: 'zstd-compress',
  [DEFLATE_COMPRESSION]: 'deflate',
  [STORE_COMPRESSION]: undefined
} as const;

const zipSyncCompressionOptions: Record<ZipSyncOptionCompression, ZipMetaCompressionMethod> = {
  store: STORE_COMPRESSION,
  deflate: DEFLATE_COMPRESSION,
  zstd: ZSTD_COMPRESSION,
  auto: DEFLATE_COMPRESSION // 'auto' is handled specially in the code
} as const;

/**
 * @public
 * Options for zipsync
 */
export interface IZipSyncPackOptions {
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
  /**
   * Compression mode. If set to 'deflate', file data will be compressed using raw DEFLATE (method 8) when this
   * produces a smaller result; otherwise it will fall back to 'store' per-file.
   */
  compression: ZipSyncOptionCompression;
}

export interface IZipSyncPackResult {
  filesPacked: number;
  metadata: IMetadata;
}

export function pack({
  archivePath,
  targetDirectories: rawTargetDirectories,
  baseDir: rawBaseDir,
  compression,
  terminal
}: IZipSyncPackOptions): IZipSyncPackResult {
  const baseDir: string = path.resolve(rawBaseDir);
  const targetDirectories: string[] = rawTargetDirectories.map((dir) => path.join(baseDir, dir));
  terminal.writeLine(`Packing to ${archivePath} from ${rawTargetDirectories.join(', ')}`);

  markStart('pack.total');
  terminal.writeDebugLine('Starting pack');
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
  using zipFile: IDisposableFileHandle = getDisposableFileHandle(archivePath, 'w');
  let currentOffset: number = 0;
  // Use this function to do any write to the zip file, so that we can track the current offset.
  function writeChunkToZip(chunk: Uint8Array, lengthBytes: number = chunk.byteLength): void {
    let offset: number = 0;
    while (lengthBytes > 0 && offset < chunk.byteLength) {
      // In practice this call always writes all data at once, but the spec says it is not an error
      // for it to not do so. Possibly that situation comes up when writing to something that is not
      // an ordinary file.
      const written: number = fs.writeSync(zipFile.fd, chunk, offset, lengthBytes);
      lengthBytes -= written;
      offset += written;
    }
    currentOffset += offset;
  }
  function writeChunksToZip(chunks: Uint8Array[]): void {
    for (const chunk of chunks) {
      writeChunkToZip(chunk);
    }
  }

  const dosDateTimeNow: { time: number; date: number } = dosDateTime(new Date());
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
    if (compression === 'deflate' || compression === 'zstd') {
      shouldCompress = true;
    } else if (compression === 'auto') {
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
      ? zipSyncCompressionOptions[compression]
      : zipSyncCompressionOptions.store;

    const entry: IFileEntry = {
      filename: relativePath,
      size: 0,
      compressedSize: 0,
      crc32: 0,
      sha1Hash: '',
      localHeaderOffset: currentOffset,
      compressionMethod,
      dosDateTime: dosDateTimeNow
    };

    writeChunksToZip(writeLocalFileHeader(entry));

    const sha1HashBuilder: crypto.Hash = crypto.createHash('sha1');
    let crc32: number = 0;
    let uncompressedSize: number = 0;
    let compressedSize: number = 0;

    using incrementalZlib: IIncrementalZlib | undefined = shouldCompress
      ? createIncrementalZlib(
          outputBuffer,
          (chunk, lengthBytes) => {
            writeChunkToZip(chunk, lengthBytes);
            compressedSize += lengthBytes;
          },
          zlibPackModes[compressionMethod]!
        )
      : undefined;

    // Also capture content if we might need it (for compression decision or storing raw data).
    // We'll accumulate into an array of buffers to avoid repeated concatenations for large files.
    readInputInChunks((bytesInInputBuffer: number) => {
      const slice: Buffer = inputBuffer.subarray(0, bytesInInputBuffer);
      sha1HashBuilder.update(slice);
      crc32 = crc32Builder(slice, crc32);
      if (incrementalZlib) {
        incrementalZlib.update(slice);
      } else {
        writeChunkToZip(slice, bytesInInputBuffer);
      }
      uncompressedSize += bytesInInputBuffer;
    });

    // finalize hashes, compression
    incrementalZlib?.update(Buffer.alloc(0));
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

  let metadataCompressionMethod: ZipMetaCompressionMethod = zipSyncCompressionOptions.store;
  let metadataData: Buffer = metadataBuffer;
  let metadataCompressedSize: number = metadataBuffer.length;
  if (compression !== 'store' && metadataBuffer.length > 64) {
    const compressed: Buffer = zlib.deflateRawSync(metadataBuffer, { level: 9 });
    if (compressed.length < metadataBuffer.length) {
      metadataCompressionMethod = zipSyncCompressionOptions.deflate;
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
    compressionMethod: metadataCompressionMethod,
    dosDateTime: dosDateTimeNow
  };

  writeChunksToZip(writeLocalFileHeader(metadataEntry));
  writeChunkToZip(metadataData, metadataCompressedSize);
  writeChunkToZip(writeDataDescriptor(metadataEntry));

  entries.push(metadataEntry);
  terminal.writeVerboseLine(`Total entries including metadata: ${entries.length}`);

  markEnd('pack.metadata.build');

  markStart('pack.write.entries');
  const outputDir: string = path.dirname(archivePath);
  fs.mkdirSync(outputDir, { recursive: true });

  markEnd('pack.write.entries');

  markStart('pack.write.centralDirectory');
  const centralDirOffset: number = currentOffset;
  for (const entry of entries) {
    writeChunksToZip(writeCentralDirectoryHeader(entry));
  }
  const centralDirSize: number = currentOffset - centralDirOffset;
  markEnd('pack.write.centralDirectory');

  // Write end of central directory
  markStart('pack.write.eocd');
  writeChunkToZip(writeEndOfCentralDirectory(centralDirOffset, centralDirSize, entries.length));
  terminal.writeDebugLine('EOCD record written');
  markEnd('pack.write.eocd');

  markEnd('pack.total');
  const total: number = getDuration('pack.total');
  emitSummary('pack', terminal);
  terminal.writeLine(`Successfully packed ${entries.length} files in ${formatDuration(total)}`);
  return { filesPacked: entries.length, metadata };
}
