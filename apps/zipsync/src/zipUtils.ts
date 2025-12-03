// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Low-level ZIP structure helpers used by the zipsync pack/unpack pipeline.
 *
 * Spec reference: https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT
 */

/**
 * Local file header signature PK\x03\x04
 */
const LOCAL_FILE_HEADER_SIGNATURE: number = 0x04034b50; // PK\x03\x04
/**
 * Central directory file header signature PK\x01\x02
 */
const CENTRAL_DIR_HEADER_SIGNATURE: number = 0x02014b50; // PK\x01\x02
/**
 * End of central directory signature PK\x05\x06
 */
const END_OF_CENTRAL_DIR_SIGNATURE: number = 0x06054b50; // PK\x05\x06
/**
 * Data descriptor signature PK\x07\x08
 */
const DATA_DESCRIPTOR_SIGNATURE: number = 0x08074b50; // PK\x07\x08

export const STORE_COMPRESSION: 0 = 0;
export const DEFLATE_COMPRESSION: 8 = 8;
export const ZSTD_COMPRESSION: 93 = 93;
export type ZipMetaCompressionMethod =
  | typeof STORE_COMPRESSION
  | typeof DEFLATE_COMPRESSION
  | typeof ZSTD_COMPRESSION;

export interface IFileEntry {
  filename: string;
  size: number;
  compressedSize: number;
  crc32: number;
  sha1Hash: string;
  localHeaderOffset: number;
  compressionMethod: ZipMetaCompressionMethod;
  dosDateTime: { time: number; date: number };
}

export interface ILocalFileHeader {
  signature: number;
  versionNeeded: number;
  flags: number;
  compressionMethod: number;
  lastModTime: number;
  lastModDate: number;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  filenameLength: number;
  extraFieldLength: number;
}

export interface ICentralDirectoryHeader {
  signature: number;
  versionMadeBy: number;
  versionNeeded: number;
  flags: number;
  compressionMethod: number;
  lastModTime: number;
  lastModDate: number;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  filenameLength: number;
  extraFieldLength: number;
  commentLength: number;
  diskNumberStart: number;
  internalFileAttributes: number;
  externalFileAttributes: number;
  localHeaderOffset: number;
}

export interface IEndOfCentralDirectory {
  signature: number;
  diskNumber: number;
  centralDirStartDisk: number;
  centralDirRecordsOnDisk: number;
  totalCentralDirRecords: number;
  centralDirSize: number;
  centralDirOffset: number;
  commentLength: number;
}

function writeUInt32LE(buffer: Buffer, value: number, offset: number): void {
  buffer.writeUInt32LE(value, offset);
}

function writeUInt16LE(buffer: Buffer, value: number, offset: number): void {
  buffer.writeUInt16LE(value, offset);
}

function readUInt32LE(buffer: Buffer, offset: number): number {
  return buffer.readUInt32LE(offset);
}

function readUInt16LE(buffer: Buffer, offset: number): number {
  return buffer.readUInt16LE(offset);
}

/**
 * Convert a JS Date into packed DOS time/date fields used by classic ZIP.
 * Seconds are stored /2 (range 0-29 => 0-58s). Years are offset from 1980.
 */
export function dosDateTime(date: Date): { time: number; date: number } {
  /* eslint-disable no-bitwise */
  const time: number =
    ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((date.getSeconds() / 2) & 0x1f);

  const dateVal: number =
    (((date.getFullYear() - 1980) & 0x7f) << 9) |
    (((date.getMonth() + 1) & 0xf) << 5) |
    (date.getDate() & 0x1f);
  /* eslint-enable no-bitwise */

  return { time, date: dateVal };
}

/**
 * Reusable scratch buffer for the fixed-length local file header (30 bytes).
 * Using a single Buffer avoids per-file allocations; callers must copy/use synchronously.
 */
const localFileHeaderBuffer: Buffer = Buffer.allocUnsafe(30);
/**
 * Write the fixed portion of a local file header for an entry (with data descriptor flag set) and
 * return the header buffer plus the variable-length filename buffer.
 *
 * Layout (little-endian):
 *   signature(4) versionNeeded(2) flags(2) method(2) modTime(2) modDate(2)
 *   crc32(4) compSize(4) uncompSize(4) nameLen(2) extraLen(2)
 *
 * Because we set bit 3 of the general purpose flag, crc32/compSize/uncompSize are zero here and the
 * actual values appear later in a trailing data descriptor record. This enables streaming without
 * buffering entire file contents beforehand.
 */
export function writeLocalFileHeader(
  entry: IFileEntry
): [fileHeaderWithoutVariableLengthData: Buffer, fileHeaderVariableLengthData: Buffer] {
  const filenameBuffer: Buffer = Buffer.from(entry.filename, 'utf8');

  const { time, date } = entry.dosDateTime;

  let offset: number = 0;
  writeUInt32LE(localFileHeaderBuffer, LOCAL_FILE_HEADER_SIGNATURE, offset);
  offset += 4;
  writeUInt16LE(localFileHeaderBuffer, 20, offset); // version needed
  offset += 2;
  // General purpose bit flag: set bit 3 (0x0008) to indicate presence of data descriptor
  // Per APPNOTE: when bit 3 is set, CRC-32 and sizes in local header are set to zero and
  // the actual values are stored in the data descriptor that follows the file data.
  writeUInt16LE(localFileHeaderBuffer, 0x0008, offset); // flags (data descriptor)
  offset += 2;
  writeUInt16LE(localFileHeaderBuffer, entry.compressionMethod, offset); // compression method (0=store,8=deflate)
  offset += 2;
  writeUInt16LE(localFileHeaderBuffer, time, offset); // last mod time
  offset += 2;
  writeUInt16LE(localFileHeaderBuffer, date, offset); // last mod date
  offset += 2;
  // With bit 3 set, these three fields MUST be zero in the local header
  writeUInt32LE(localFileHeaderBuffer, 0, offset); // crc32 (placeholder, real value in data descriptor)
  offset += 4;
  writeUInt32LE(localFileHeaderBuffer, 0, offset); // compressed size (placeholder)
  offset += 4;
  writeUInt32LE(localFileHeaderBuffer, 0, offset); // uncompressed size (placeholder)
  offset += 4;
  writeUInt16LE(localFileHeaderBuffer, filenameBuffer.length, offset); // filename length
  offset += 2;
  writeUInt16LE(localFileHeaderBuffer, 0, offset); // extra field length
  offset += 2;

  return [localFileHeaderBuffer, filenameBuffer];
}

/**
 * Reusable scratch buffer for central directory entries (fixed-length 46 bytes before filename)
 */
const centralDirHeaderBuffer: Buffer = Buffer.allocUnsafe(46);
/**
 * Write a central directory header referencing an already written local file entry.
 * Central directory consolidates the final CRC + sizes (always present here) and provides a table
 * for fast enumeration without scanning the archive sequentially.
 */
export function writeCentralDirectoryHeader(entry: IFileEntry): Buffer[] {
  const filenameBuffer: Buffer = Buffer.from(entry.filename, 'utf8');

  const now: Date = new Date();
  const { time, date } = dosDateTime(now);

  let offset: number = 0;
  writeUInt32LE(centralDirHeaderBuffer, CENTRAL_DIR_HEADER_SIGNATURE, offset);
  offset += 4;
  writeUInt16LE(centralDirHeaderBuffer, 20, offset); // version made by
  offset += 2;
  writeUInt16LE(centralDirHeaderBuffer, 20, offset); // version needed
  offset += 2;
  // Mirror flags used in local header (bit 3 set to indicate data descriptor was used)
  writeUInt16LE(centralDirHeaderBuffer, 0x0008, offset); // flags
  offset += 2;
  writeUInt16LE(centralDirHeaderBuffer, entry.compressionMethod, offset); // compression method
  offset += 2;
  writeUInt16LE(centralDirHeaderBuffer, time, offset); // last mod time
  offset += 2;
  writeUInt16LE(centralDirHeaderBuffer, date, offset); // last mod date
  offset += 2;
  writeUInt32LE(centralDirHeaderBuffer, entry.crc32, offset); // crc32
  offset += 4;
  writeUInt32LE(centralDirHeaderBuffer, entry.compressedSize, offset); // compressed size
  offset += 4;
  writeUInt32LE(centralDirHeaderBuffer, entry.size, offset); // uncompressed size
  offset += 4;
  writeUInt16LE(centralDirHeaderBuffer, filenameBuffer.length, offset); // filename length
  offset += 2;
  writeUInt16LE(centralDirHeaderBuffer, 0, offset); // extra field length
  offset += 2;
  writeUInt16LE(centralDirHeaderBuffer, 0, offset); // comment length
  offset += 2;
  writeUInt16LE(centralDirHeaderBuffer, 0, offset); // disk number start
  offset += 2;
  writeUInt16LE(centralDirHeaderBuffer, 0, offset); // internal file attributes
  offset += 2;
  writeUInt32LE(centralDirHeaderBuffer, 0, offset); // external file attributes
  offset += 4;
  writeUInt32LE(centralDirHeaderBuffer, entry.localHeaderOffset, offset); // local header offset
  offset += 4;

  return [centralDirHeaderBuffer, filenameBuffer];
}

/**
 * Data descriptor: signature(4) crc32(4) compSize(4) uncompSize(4)
 */
const dataDescriptorBuffer: Buffer = Buffer.allocUnsafe(16);
/**
 * Write the trailing data descriptor for an entry. Only used because we set flag bit 3 in the
 * local file header allowing deferred CRC/size calculation.
 */
export function writeDataDescriptor(entry: IFileEntry): Buffer {
  let offset: number = 0;
  writeUInt32LE(dataDescriptorBuffer, DATA_DESCRIPTOR_SIGNATURE, offset); // signature PK\x07\x08
  offset += 4;
  writeUInt32LE(dataDescriptorBuffer, entry.crc32, offset); // crc32
  offset += 4;
  writeUInt32LE(dataDescriptorBuffer, entry.compressedSize, offset); // compressed size
  offset += 4;
  writeUInt32LE(dataDescriptorBuffer, entry.size, offset); // uncompressed size
  return dataDescriptorBuffer;
}

/**
 * End of central directory (EOCD) record (22 bytes when comment length = 0)
 */
const endOfCentralDirBuffer: Buffer = Buffer.allocUnsafe(22);
/**
 * Write the EOCD record referencing the accumulated central directory. We omit archive comments
 * and do not support ZIP64 (sufficient for build cache archive sizes today).
 */
export function writeEndOfCentralDirectory(
  centralDirOffset: number,
  centralDirSize: number,
  entryCount: number
): Buffer {
  let offset: number = 0;
  writeUInt32LE(endOfCentralDirBuffer, END_OF_CENTRAL_DIR_SIGNATURE, offset);
  offset += 4;
  writeUInt16LE(endOfCentralDirBuffer, 0, offset); // disk number
  offset += 2;
  writeUInt16LE(endOfCentralDirBuffer, 0, offset); // central dir start disk
  offset += 2;
  writeUInt16LE(endOfCentralDirBuffer, entryCount, offset); // central dir records on disk
  offset += 2;
  writeUInt16LE(endOfCentralDirBuffer, entryCount, offset); // total central dir records
  offset += 2;
  writeUInt32LE(endOfCentralDirBuffer, centralDirSize, offset); // central dir size
  offset += 4;
  writeUInt32LE(endOfCentralDirBuffer, centralDirOffset, offset); // central dir offset
  offset += 4;
  writeUInt16LE(endOfCentralDirBuffer, 0, offset); // comment length

  return endOfCentralDirBuffer;
}

interface ILocalFileHeaderParseResult {
  header: ILocalFileHeader;
  nextOffset: number;
}

/**
 * Parse a local file header at the provided offset. Minimal validation: signature check only.
 * Returns header plus the offset pointing just past the variable-length name+extra field.
 */
export function parseLocalFileHeader(buffer: Buffer, offset: number): ILocalFileHeaderParseResult {
  const signature: number = readUInt32LE(buffer, offset);
  if (signature !== LOCAL_FILE_HEADER_SIGNATURE) {
    throw new Error(
      `Unexpected local file header signature at offset ${offset.toString(16)}: ${signature.toString(16)}`
    );
  }
  const header: ILocalFileHeader = {
    signature,
    versionNeeded: readUInt16LE(buffer, offset + 4),
    flags: readUInt16LE(buffer, offset + 6),
    compressionMethod: readUInt16LE(buffer, offset + 8),
    lastModTime: readUInt16LE(buffer, offset + 10),
    lastModDate: readUInt16LE(buffer, offset + 12),
    crc32: readUInt32LE(buffer, offset + 14),
    compressedSize: readUInt32LE(buffer, offset + 18),
    uncompressedSize: readUInt32LE(buffer, offset + 22),
    filenameLength: readUInt16LE(buffer, offset + 26),
    extraFieldLength: readUInt16LE(buffer, offset + 28)
  };

  return {
    header,
    nextOffset: offset + 30 + header.filenameLength + header.extraFieldLength
  };
}

export interface ICentralDirectoryHeaderParseResult {
  header: ICentralDirectoryHeader;
  filename: string;
  nextOffset: number;
}

/**
 * Parse a central directory header at the given offset (within a sliced central directory buffer).
 * Returns header, filename string, and nextOffset pointing to the next structure.
 */
export function parseCentralDirectoryHeader(
  buffer: Buffer,
  offset: number
): ICentralDirectoryHeaderParseResult {
  const signature: number = readUInt32LE(buffer, offset);
  if (signature !== CENTRAL_DIR_HEADER_SIGNATURE) {
    throw new Error(
      `Unexpected central directory signature at offset ${offset.toString(16)}: ${signature.toString(16)}`
    );
  }
  const header: ICentralDirectoryHeader = {
    signature,
    versionMadeBy: readUInt16LE(buffer, offset + 4),
    versionNeeded: readUInt16LE(buffer, offset + 6),
    flags: readUInt16LE(buffer, offset + 8),
    compressionMethod: readUInt16LE(buffer, offset + 10),
    lastModTime: readUInt16LE(buffer, offset + 12),
    lastModDate: readUInt16LE(buffer, offset + 14),
    crc32: readUInt32LE(buffer, offset + 16),
    compressedSize: readUInt32LE(buffer, offset + 20),
    uncompressedSize: readUInt32LE(buffer, offset + 24),
    filenameLength: readUInt16LE(buffer, offset + 28),
    extraFieldLength: readUInt16LE(buffer, offset + 30),
    commentLength: readUInt16LE(buffer, offset + 32),
    diskNumberStart: readUInt16LE(buffer, offset + 34),
    internalFileAttributes: readUInt16LE(buffer, offset + 36),
    externalFileAttributes: readUInt32LE(buffer, offset + 38),
    localHeaderOffset: readUInt32LE(buffer, offset + 42)
  };

  offset += 46;

  const filename: string = buffer.toString('utf8', offset, offset + header.filenameLength);

  return {
    header,
    filename,
    nextOffset: offset + header.filenameLength + header.extraFieldLength + header.commentLength
  };
}

/**
 * Locate the EOCD record by reverse scanning. Since we never write a comment the EOCD will be the
 * first matching signature encountered scanning backwards from the end.
 */
export function findEndOfCentralDirectory(buffer: Buffer): IEndOfCentralDirectory {
  for (let i: number = buffer.length - 22; i >= 0; i--) {
    if (readUInt32LE(buffer, i) === END_OF_CENTRAL_DIR_SIGNATURE) {
      return {
        signature: readUInt32LE(buffer, i),
        diskNumber: readUInt16LE(buffer, i + 4),
        centralDirStartDisk: readUInt16LE(buffer, i + 6),
        centralDirRecordsOnDisk: readUInt16LE(buffer, i + 8),
        totalCentralDirRecords: readUInt16LE(buffer, i + 10),
        centralDirSize: readUInt32LE(buffer, i + 12),
        centralDirOffset: readUInt32LE(buffer, i + 16),
        commentLength: readUInt16LE(buffer, i + 20)
      };
    }
  }

  throw new Error('End of central directory not found');
}

/**
 * Slice out the (possibly compressed) file data bytes for a central directory entry.
 * Caller will decompress if needed based on entry.header.compressionMethod.
 */
export function getFileFromZip(zipBuffer: Buffer, entry: ICentralDirectoryHeaderParseResult): Buffer {
  const { header: localFileHeader } = parseLocalFileHeader(zipBuffer, entry.header.localHeaderOffset);
  const localDataOffset: number =
    entry.header.localHeaderOffset + 30 + localFileHeader.filenameLength + localFileHeader.extraFieldLength;
  const fileZipBuffer: Buffer = zipBuffer.subarray(
    localDataOffset,
    localDataOffset + entry.header.compressedSize
  );
  return fileZipBuffer;
}
