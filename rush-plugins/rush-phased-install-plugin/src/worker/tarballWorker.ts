// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import { parentPort } from 'node:worker_threads';

import { gunzipSync, type IDecompressResult } from './gunzipSync';

import type { IParseResult, ITarballExtractMessage, ITarballParseMessage } from '../types';

function handleMessage(message: ITarballParseMessage | ITarballExtractMessage | false): void {
  if (message === false) {
    // Accept the message `false` as a signal to exit the worker.
    parentPort!.off('message', handleMessage);
    process.exit(0);
  }

  const { buffer, integrity } = message;

  try {
    switch (message.type) {
      case 'parse':
        const { length } = message;
        // Need to convert the raw ArrayBuffer back to a Buffer instance
        const parseResult: IParseResult = processTarballInWorker(Buffer.from(buffer, 0, length), integrity);
        parentPort!.postMessage({ requestId: integrity, status: 'success', value: parseResult });
        return;
      case 'extract':
        const { folder, files } = message;
        // Need to convert the raw ArrayBuffer back to a Buffer instance
        const extractResult: boolean = extractTar(Buffer.from(buffer), files, folder);
        parentPort!.postMessage({ requestId: integrity, status: 'success', value: extractResult });
        return;
    }
  } catch (e) {
    parentPort!.postMessage({ requestId: integrity, status: 'error', error: e });
  }
}

parentPort!.on('message', handleMessage);

interface IFile {
  offset: number;
  mode: number;
  size: number;
}

const ZERO: number = '0'.charCodeAt(0);
const SPACE: number = ' '.charCodeAt(0);
const SLASH: number = '/'.charCodeAt(0);
const BACKSLASH: number = '\\'.charCodeAt(0);

// See TAR specification here: https://www.gnu.org/software/tar/manual/html_node/Standard.html
function parseTarball(buffer: Buffer): IParseResult {
  const files: Map<string, IFile> = new Map();

  let pathTrimmed: boolean = false;

  let mode: number = 0;
  let fileSize: number = 0;
  let fileType: number = 0;

  let prefix: string = '';
  let fileName: string = '';

  let blockBytes: number = 0;

  let blockStart: number = 0;
  while (buffer[blockStart] !== 0) {
    // Parse out a TAR header. header size is 512 bytes.
    // The file type is a single byte at offset 156 in the header
    fileType = buffer[blockStart + 156];
    // The file size is an octal number encoded as UTF-8. It is terminated by a NUL or space. Maximum length 12 characters.
    fileSize = parseOctal(blockStart + 124, 12);

    // The total size will always be an integer number of 512 byte blocks.
    // Also include 1 block for the header itself.
    // eslint-disable-next-line no-bitwise
    blockBytes = (fileSize & ~0x1ff) + (fileSize & 0x1ff ? 1024 : 512);

    // Mark that the first path segment has not been removed.
    pathTrimmed = false;
    // The full file path is an optional prefix at offset 345, followed by the file name at offset 0, separated by a '/'.
    // Both values are terminated by a NUL if not using the full length of the field.
    prefix = parseString(blockStart + 345, 155);

    // If the prefix is present and did not contain a `/` or `\\`, then the prefix is the first path segment and should be dropped entirely.
    if (prefix && !pathTrimmed) {
      pathTrimmed = true;
      prefix = '';
    }

    // Get the base filename at offset 0, up to 100 characters.
    fileName = parseString(blockStart, 100);

    if (prefix) {
      // If the prefix was not trimmed entirely (or absent), need to join with the remaining filename
      fileName = `${prefix}/${fileName}`;
    }

    // Values '\0' and '0' are normal files.
    // Treat all other file types as non-existent
    // However, we still need to parse the name to handle collisions
    if (fileType === 0 || fileType === ZERO) {
      // The file mode is an octal number encoded as UTF-8. It is terminated by a NUL or space. Maximum length 8 characters.
      mode = parseOctal(blockStart + 100, 8);

      // The TAR format is an append-only data structure; as such later entries with the same name supercede earlier ones.
      files.set(fileName, { offset: blockStart + 512, mode, size: fileSize });
    } else {
      // Since later entries win, if this is not a normal file, delete any previous entry.
      files.delete(fileName);
    }

    // Move to the next record in the TAR archive.
    blockStart += blockBytes;
  }

  return { files, buffer: buffer.buffer };

  /**
   * Parses a UTF-8 string at the specified `offset`, up to `length` characters. If it ends early, it will be terminated by a NUL.
   * Will trim the first segment if `pathTrimmed` is currently false and the string contains a `/` or `\\`.
   */
  function parseString(offset: number, length: number): string {
    let end: number = offset;
    const max: number = length + offset;
    for (let char: number = buffer[end]; char !== 0 && end !== max; char = buffer[++end]) {
      if (!pathTrimmed && (char === SLASH || char === BACKSLASH)) {
        pathTrimmed = true;
        offset = end + 1;
      }
    }
    return buffer.toString('utf8', offset, end);
  }

  /**
   * Parses an octal number at the specified `offset`, up to `length` characters. If it ends early, it will be terminated by either
   * a NUL or a space.
   */
  function parseOctal(offset: number, length: number): number {
    let position: number = offset;
    const max: number = length + offset;
    let value: number = 0;
    for (
      let char: number = buffer[position];
      char !== 0 && char !== SPACE && position !== max;
      char = buffer[++position]
    ) {
      // eslint-disable-next-line no-bitwise
      value <<= 3;
      // eslint-disable-next-line no-bitwise
      value |= char - ZERO;
    }
    return value;
  }
  // eslint-enable no-var
}

const INTEGRITY_REGEX: RegExp = /^([^-]+)-([A-Za-z0-9+\/=]+)$/;

function processTarballInWorker(buffer: Buffer, remoteIntegrity: string | undefined): IParseResult {
  if (remoteIntegrity) {
    const [, algo, integrityHash] = remoteIntegrity.match(INTEGRITY_REGEX)!;
    // Compensate for the possibility of non-uniform Base64 padding
    const normalizedRemoteHash: string = Buffer.from(integrityHash, 'base64').toString('hex');

    const calculatedHash: string = crypto.createHash(algo).update(buffer).digest('hex');
    if (calculatedHash !== normalizedRemoteHash) {
      throw new Error(
        `integrity validation failed:\nintegrity: ${remoteIntegrity}\nexpected: ${normalizedRemoteHash}\nreceived: ${calculatedHash}`
      );
    }
  } else {
    throw new Error('remote does not have an integrity');
  }

  const tarContent: IDecompressResult = gunzipSync(buffer);
  // Merge the result into a SharedArrayBuffer so that it can be shared with the unpack workers (which might not be this one)
  const sharedBuffer: Buffer = Buffer.from(new SharedArrayBuffer(tarContent.totalBytes));
  let offset: number = 0;
  for (const segment of tarContent.buffers) {
    segment.copy(sharedBuffer, offset);
    offset += segment.byteLength;
  }

  return parseTarball(sharedBuffer);
}

/**
 * Extracts the files in the tar archive to the specified folder using synchronous I/O.
 * The reason for using synchronous rather than asynchronous I/O operations is that the implementation
 * of NodeJS's `fs` modules is ultimately synchronous, just hidden by its own thread pool.
 *
 * @param buffer - The raw contents of the tar archive
 * @param files - The index of the tar archive
 * @param folder - The folder to unpack files to
 * @returns true
 */
function extractTar(buffer: Buffer, files: Iterable<[string, IFile]>, folder: string): boolean {
  const createdFolders: Set<string> = new Set();

  for (const [relativePath, { mode, offset, size }] of files) {
    const lastSlashIndex: number = relativePath.lastIndexOf('/');
    const targetDir: string =
      lastSlashIndex >= 0 ? `${folder}/${relativePath.slice(0, lastSlashIndex)}` : folder;
    const targetPath: string = `${folder}/${relativePath}`;

    if (!createdFolders.has(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
      createdFolders.add(targetDir);
    }

    // This bit needs a revisit in the profiler; there was a reason I switched from using fs.writeFileSync but I
    // no longer remember what it was.
    const fd: number = fs.openSync(targetPath, 'w', mode);
    try {
      let written: number = 0;
      while (written < size) {
        written += fs.writeSync(fd, buffer, offset + written, size - written, written);
      }
    } finally {
      fs.closeSync(fd);
    }
  }

  return true;
}
