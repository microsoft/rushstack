// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// The index format packs flags into bits
/* eslint-disable no-bitwise */

import { createHash, type Hash } from 'node:crypto';

// The format is described in https://git-scm.com/docs/index-format
const INDEX_SIGNATURE: string = 'DIRC';
const HEADER_LENGTH: number = 12;
const MAX_INDEX_LENGTH: number = 2 ** 32 - 1;
// ctime, mtime, dev, ino, mode, uid, gid and size, 4 bytes each except the 8-byte times
const ENTRY_STAT_LENGTH: number = 40;
const ENTRY_MODE_OFFSET: number = 24;
const ENTRY_MODE_LENGTH: number = 4;
// The object type bits of the mode: a regular file, a symbolic link or a gitlink
const ENTRY_MODE_TYPE_SHIFT: number = 12;
const ENTRY_SIZE_OFFSET: number = 36;
const ENTRY_SIZE_LENGTH: number = 4;
const ENTRY_FLAGS_LENGTH: number = 2;
const ENTRY_EXTENDED_FLAG: number = 0x4000;
const ENTRY_STAGE_MASK: number = 0x3000;
const EXTENSION_HEADER_LENGTH: number = 8;
const SPLIT_INDEX_EXTENSION_SIGNATURE: string = 'link';
const UNTRACKED_CACHE_EXTENSION_SIGNATURE: string = 'UNTR';
const FSMONITOR_EXTENSION_SIGNATURE: string = 'FSMN';
// Git ignores an extension whose signature starts with an uppercase letter if it doesn't understand it
const FIRST_OPTIONAL_SIGNATURE_CHARACTER_CODE: number = 0x41;
const LAST_OPTIONAL_SIGNATURE_CHARACTER_CODE: number = 0x5a;
// A new copy of the index takes the untracked cache and the file system monitor's state from the previous copy. It
// drops "EOIE", which describes the extensions that follow the entries, since those change, and so also "IEOT", which
// lets Git read the entries with several threads, since Git only finds it through "EOIE".
const REPLACED_EXTENSION_SIGNATURES: ReadonlySet<string> = new Set([
  'EOIE',
  'IEOT',
  UNTRACKED_CACHE_EXTENSION_SIGNATURE,
  FSMONITOR_EXTENSION_SIGNATURE
]);
const FSMONITOR_VERSION_1: number = 1;
const FSMONITOR_VERSION_2: number = 2;
const FSMONITOR_VERSION_LENGTH: number = 4;
// Version 1 identifies the state of the file system monitor with a time, and version 2 with a NUL-terminated token
const FSMONITOR_VERSION_1_TIME_LENGTH: number = 8;
const FSMONITOR_BITMAP_SIZE_LENGTH: number = 4;
const SHA256_OBJECT_ID_LENGTH: number = 32;

// An EWAH bitmap is a sequence of 64-bit words, stored as two 32-bit halves in big-endian order. Each "marker" word
// has the value of a run of identical words (bit 0), the length of the run (bits 1-32) and the number of literal
// words that follow the marker (bits 33-63). See ewah/ewok_rlw.h in the Git source code.
const EWAH_HEADER_LENGTH: number = 8;
const EWAH_WORD_LENGTH: number = 8;
const EWAH_HALF_WORD_LENGTH: number = 4;
const EWAH_MARKER_POSITION_LENGTH: number = 4;
const BITS_PER_EWAH_WORD: number = 64;
const BITS_PER_EWAH_HALF_WORD: number = 32;
const MAX_EWAH_RUN_LENGTH: number = 2 ** 32 - 1;
const MAX_EWAH_LITERAL_WORD_COUNT: number = 2 ** 31 - 1;

/**
 * A summary of a Git index file.
 */
export interface IGitIndexSummary {
  readonly entryCount: number;
  /**
   * A digest of the header and of every entry's mode, object ID, flags and path. It omits the file system data
   * (times, device, inode, owner and size) that refreshing the index updates, and the extensions, such as the
   * untracked cache and the file system monitor's token. Two indexes with the same digest describe the same files.
   */
  readonly entriesDigest: string;
  /**
   * A digest of the size that the index records for each entry. Git considers a file modified, without examining
   * its content, if the recorded size is not 0 and differs from the size of the file. So two indexes with the same
   * entries digest may still disagree about which files are modified, unless their sizes digests are the same too.
   */
  readonly sizesDigest: string;
  /**
   * Whether the index is split: its entries are then completed by a shared index file.
   */
  readonly isSplit: boolean;
}

/**
 * The location of an extension in a Git index file.
 */
export interface IGitIndexExtension {
  readonly signature: string;
  /**
   * The offset of the extension's header.
   */
  readonly start: number;
  /**
   * The offset after the extension's data.
   */
  readonly end: number;
}

/**
 * The locations of the parts of a Git index file.
 */
export interface IGitIndexLayout {
  readonly version: number;
  readonly entryCount: number;
  /**
   * The offset of each entry, followed by the offset after the last entry.
   */
  readonly entryOffsets: Uint32Array;
  /**
   * The offset of each entry's path. In a version 4 index, the path starts with the number of characters to remove
   * from the end of the previous entry's path.
   */
  readonly pathOffsets: Uint32Array;
  /**
   * The offset of the NUL that ends each entry's path.
   */
  readonly pathEndOffsets: Uint32Array;
  readonly extensions: ReadonlyArray<IGitIndexExtension>;
  /**
   * The offset of the checksum, which ends the file.
   */
  readonly checksumOffset: number;
}

/**
 * Returns the number of entries that the header of a Git index file declares, or `undefined` if the data doesn't
 * start with the header of a Git index file.
 */
export function tryGetGitIndexEntryCount(header: Buffer): number | undefined {
  if (
    header.length < HEADER_LENGTH ||
    header.toString('latin1', 0, INDEX_SIGNATURE.length) !== INDEX_SIGNATURE
  ) {
    return undefined;
  }

  return header.readUInt32BE(8);
}

/**
 * Locates the entries and extensions of a Git index file of version 2, 3 or 4.
 *
 * @param content - The content of the index file
 * @param objectIdLength - The length of an object ID in bytes: 20 for SHA-1, or 32 for SHA-256
 */
export function parseGitIndexLayout(content: Buffer, objectIdLength: number): IGitIndexLayout {
  const entryCount: number | undefined = tryGetGitIndexEntryCount(content);
  if (entryCount === undefined) {
    throw new Error('The file is not a Git index');
  }

  const version: number = content.readUInt32BE(4);
  if (version < 2 || version > 4) {
    throw new Error(`Unsupported Git index version ${version}`);
  }

  // The offsets are stored in 32 bits
  if (content.length > MAX_INDEX_LENGTH) {
    throw new Error('The Git index is too large');
  }

  const checksumOffset: number = content.length - objectIdLength;
  // Each entry has at least its file system data, object ID and flags, and a NUL after its path
  if (
    HEADER_LENGTH + entryCount * (ENTRY_STAT_LENGTH + objectIdLength + ENTRY_FLAGS_LENGTH + 1) >
    checksumOffset
  ) {
    throw new Error('The Git index ends within an entry');
  }

  const entryOffsets: Uint32Array = new Uint32Array(entryCount + 1);
  const pathOffsets: Uint32Array = new Uint32Array(entryCount);
  const pathEndOffsets: Uint32Array = new Uint32Array(entryCount);
  let offset: number = HEADER_LENGTH;
  for (let i: number = 0; i < entryCount; i++) {
    entryOffsets[i] = offset;
    const flagsOffset: number = offset + ENTRY_STAT_LENGTH + objectIdLength;
    if (flagsOffset + ENTRY_FLAGS_LENGTH > checksumOffset) {
      throw new Error('The Git index ends within an entry');
    }

    const flags: number = content.readUInt16BE(flagsOffset);
    let pathOffset: number = flagsOffset + ENTRY_FLAGS_LENGTH;
    if (flags & ENTRY_EXTENDED_FLAG) {
      // Extended flags follow, for example "skip-worktree" and "intent-to-add"
      pathOffset += ENTRY_FLAGS_LENGTH;
    }

    pathOffsets[i] = pathOffset;
    if (version === 4) {
      // The path is prefix-compressed: a variable-length integer, then the rest of the path and a NUL
      while (pathOffset < checksumOffset && content[pathOffset] & 0x80) {
        pathOffset++;
      }
      pathOffset++;
    }

    const pathEnd: number = content.indexOf(0, pathOffset);
    if (pathEnd < 0 || pathEnd >= checksumOffset) {
      throw new Error('The Git index ends within an entry');
    }

    pathEndOffsets[i] = pathEnd;
    // Before version 4, each entry is padded with 1-8 NULs to a multiple of 8 bytes
    offset = version === 4 ? pathEnd + 1 : offset + ((pathEnd - offset + 8) & ~7);
  }

  entryOffsets[entryCount] = offset;
  const extensions: IGitIndexExtension[] = [];
  while (offset + EXTENSION_HEADER_LENGTH <= checksumOffset) {
    const start: number = offset;
    offset += EXTENSION_HEADER_LENGTH + content.readUInt32BE(offset + 4);
    extensions.push({ signature: content.toString('latin1', start, start + 4), start, end: offset });
  }

  if (offset !== checksumOffset) {
    throw new Error('The extensions of the Git index are malformed');
  }

  return { version, entryCount, entryOffsets, pathOffsets, pathEndOffsets, extensions, checksumOffset };
}

/**
 * Summarizes the content of a Git index file of version 2, 3 or 4.
 *
 * @param content - The content of the index file
 * @param objectIdLength - The length of an object ID in bytes: 20 for SHA-1, or 32 for SHA-256
 */
export function summarizeGitIndex(content: Buffer, objectIdLength: number): IGitIndexSummary {
  const { entryCount, entryOffsets, extensions }: IGitIndexLayout = parseGitIndexLayout(
    content,
    objectIdLength
  );
  const entriesEnd: number = entryOffsets[entryCount];
  // A copy of the entries in which the file system data of each entry is cleared, except for the mode
  const entries: Buffer = Buffer.from(content.subarray(0, entriesEnd));
  const sizes: Buffer = Buffer.alloc(entryCount * ENTRY_SIZE_LENGTH);
  for (let i: number = 0; i < entryCount; i++) {
    const offset: number = entryOffsets[i];
    sizes.writeUInt32BE(content.readUInt32BE(offset + ENTRY_SIZE_OFFSET), i * ENTRY_SIZE_LENGTH);
    entries.fill(0, offset, offset + ENTRY_MODE_OFFSET);
    entries.fill(0, offset + ENTRY_MODE_OFFSET + ENTRY_MODE_LENGTH, offset + ENTRY_STAT_LENGTH);
  }

  return {
    entryCount,
    entriesDigest: createHash('sha1').update(entries.subarray(4, entriesEnd)).digest('hex'),
    sizesDigest: createHash('sha1').update(sizes).digest('hex'),
    isSplit: extensions.some(
      ({ signature }: IGitIndexExtension) => signature === SPLIT_INDEX_EXTENSION_SIGNATURE
    )
  };
}

/**
 * Builds a new copy of a Git index that keeps the untracked cache and the state of the file system monitor of the
 * previous copy, so that `git status` doesn't examine the folders and files that didn't change since it last
 * examined the previous copy. The new copy has the header, entries and other extensions of the index.
 *
 * @remarks
 * The untracked cache lists the untracked files in each folder, which depends on which paths the index records.
 * So the copy keeps it only if the index records the same paths, with the same stages and object types, as the
 * previous copy. The file system monitor's state says which entries Git needn't examine, because they didn't
 * change since the monitor's token: the copy marks the entries that differ from those in the previous copy as
 * changed, and keeps the token of the previous copy, which matches its untracked cache.
 *
 * @param content - The content of the index
 * @param previousContent - The content of the previous copy of the index
 * @param objectIdLength - The length of an object ID in bytes: 20 for SHA-1, or 32 for SHA-256
 * @returns The content of the new copy, or `undefined` if it can't keep the state of the previous copy: when the
 * index and the previous copy record different paths, have different versions, or have an extension that Git
 * requires to understand, such as that of a split or sparse index, or when the previous copy has no untracked
 * cache.
 */
export function tryCarryOverGitIndexCaches(
  content: Buffer,
  previousContent: Buffer,
  objectIdLength: number
): Buffer | undefined {
  const layout: IGitIndexLayout = parseGitIndexLayout(content, objectIdLength);
  const previousLayout: IGitIndexLayout = parseGitIndexLayout(previousContent, objectIdLength);
  const untrackedCache: IGitIndexExtension | undefined = findExtension(
    previousLayout,
    UNTRACKED_CACHE_EXTENSION_SIGNATURE
  );
  if (
    !untrackedCache ||
    layout.version !== previousLayout.version ||
    layout.entryCount !== previousLayout.entryCount ||
    hasRequiredExtension(layout) ||
    hasRequiredExtension(previousLayout)
  ) {
    return undefined;
  }

  const changedEntries: Uint8Array | undefined = tryFindChangedEntries(
    content,
    layout,
    previousContent,
    previousLayout,
    objectIdLength
  );
  if (!changedEntries) {
    return undefined;
  }

  const parts: Buffer[] = [content.subarray(0, layout.entryOffsets[layout.entryCount])];
  for (const { signature, start, end } of layout.extensions) {
    if (!REPLACED_EXTENSION_SIGNATURES.has(signature)) {
      parts.push(content.subarray(start, end));
    }
  }

  parts.push(previousContent.subarray(untrackedCache.start, untrackedCache.end));
  const fsmonitor: IGitIndexExtension | undefined = findExtension(
    previousLayout,
    FSMONITOR_EXTENSION_SIGNATURE
  );
  if (fsmonitor) {
    const fsmonitorExtension: Buffer | undefined = tryUpdateFsmonitorExtension(
      previousContent.subarray(fsmonitor.start, fsmonitor.end),
      changedEntries
    );
    if (!fsmonitorExtension) {
      return undefined;
    }

    parts.push(fsmonitorExtension);
  }

  // With "index.skipHash", Git writes zeros instead of the checksum
  const checksum: Buffer = Buffer.alloc(objectIdLength);
  if (content.subarray(layout.checksumOffset).some((byte: number) => byte !== 0)) {
    const hash: Hash = createHash(objectIdLength === SHA256_OBJECT_ID_LENGTH ? 'sha256' : 'sha1');
    for (const part of parts) {
      hash.update(part);
    }

    hash.digest().copy(checksum);
  }

  parts.push(checksum);
  return Buffer.concat(parts);
}

function findExtension(layout: IGitIndexLayout, signature: string): IGitIndexExtension | undefined {
  return layout.extensions.find((extension: IGitIndexExtension) => extension.signature === signature);
}

function hasRequiredExtension(layout: IGitIndexLayout): boolean {
  return layout.extensions.some(({ signature }: IGitIndexExtension) => {
    const characterCode: number = signature.charCodeAt(0);
    return (
      characterCode < FIRST_OPTIONAL_SIGNATURE_CHARACTER_CODE ||
      characterCode > LAST_OPTIONAL_SIGNATURE_CHARACTER_CODE
    );
  });
}

/**
 * Returns a flag for each entry, which is 1 if the entry differs from the one in the previous copy, or `undefined`
 * if an entry has a different path, stage or object type.
 */
function tryFindChangedEntries(
  content: Buffer,
  layout: IGitIndexLayout,
  previousContent: Buffer,
  previousLayout: IGitIndexLayout,
  objectIdLength: number
): Uint8Array | undefined {
  const changedEntries: Uint8Array = new Uint8Array(layout.entryCount);
  for (let i: number = 0; i < layout.entryCount; i++) {
    const start: number = layout.entryOffsets[i];
    const previousStart: number = previousLayout.entryOffsets[i];
    if (
      content.compare(
        previousContent,
        previousStart,
        previousLayout.entryOffsets[i + 1],
        start,
        layout.entryOffsets[i + 1]
      ) === 0
    ) {
      continue;
    }

    // All previous paths are the same, so in a version 4 index, the same path is compressed the same way
    const flagsOffset: number = ENTRY_STAT_LENGTH + objectIdLength;
    if (
      (content.readUInt16BE(start + flagsOffset) & ENTRY_STAGE_MASK) !==
        (previousContent.readUInt16BE(previousStart + flagsOffset) & ENTRY_STAGE_MASK) ||
      content.readUInt32BE(start + ENTRY_MODE_OFFSET) >>> ENTRY_MODE_TYPE_SHIFT !==
        previousContent.readUInt32BE(previousStart + ENTRY_MODE_OFFSET) >>> ENTRY_MODE_TYPE_SHIFT ||
      content.compare(
        previousContent,
        previousLayout.pathOffsets[i],
        previousLayout.pathEndOffsets[i],
        layout.pathOffsets[i],
        layout.pathEndOffsets[i]
      ) !== 0
    ) {
      return undefined;
    }

    changedEntries[i] = 1;
  }

  return changedEntries;
}

/**
 * Builds a file system monitor extension with the token of the given one, in which the changed entries are also
 * marked as changed. Returns `undefined` if the extension is malformed.
 */
function tryUpdateFsmonitorExtension(extension: Buffer, changedEntries: Uint8Array): Buffer | undefined {
  const data: Buffer = extension.subarray(EXTENSION_HEADER_LENGTH);
  if (data.length < FSMONITOR_VERSION_LENGTH) {
    return undefined;
  }

  let bitmapSizeOffset: number;
  switch (data.readUInt32BE(0)) {
    case FSMONITOR_VERSION_1:
      bitmapSizeOffset = FSMONITOR_VERSION_LENGTH + FSMONITOR_VERSION_1_TIME_LENGTH;
      break;
    case FSMONITOR_VERSION_2:
      bitmapSizeOffset = data.indexOf(0, FSMONITOR_VERSION_LENGTH) + 1;
      if (bitmapSizeOffset === 0) {
        return undefined;
      }
      break;
    default:
      return undefined;
  }

  const bitmapOffset: number = bitmapSizeOffset + FSMONITOR_BITMAP_SIZE_LENGTH;
  if (bitmapOffset > data.length) {
    return undefined;
  }

  const bitmapEnd: number = bitmapOffset + data.readUInt32BE(bitmapSizeOffset);
  const changedEntriesOfPreviousCopy: Uint8Array | undefined =
    bitmapEnd <= data.length
      ? tryReadEwahBitmap(data.subarray(bitmapOffset, bitmapEnd), changedEntries.length)
      : undefined;
  if (!changedEntriesOfPreviousCopy) {
    return undefined;
  }

  for (let i: number = 0; i < changedEntries.length; i++) {
    changedEntriesOfPreviousCopy[i] |= changedEntries[i];
  }

  const bitmap: Buffer = writeEwahBitmap(changedEntriesOfPreviousCopy);
  const header: Buffer = Buffer.from(extension.subarray(0, EXTENSION_HEADER_LENGTH + bitmapSizeOffset));
  header.writeUInt32BE(bitmapOffset + bitmap.length, 4);
  const bitmapSize: Buffer = Buffer.alloc(FSMONITOR_BITMAP_SIZE_LENGTH);
  bitmapSize.writeUInt32BE(bitmap.length);
  return Buffer.concat([header, bitmapSize, bitmap]);
}

/**
 * Reads an EWAH bitmap, as Git serializes it, into a flag for each bit. Returns `undefined` if the bitmap is
 * malformed, or has a bit at or beyond the given count.
 */
export function tryReadEwahBitmap(data: Buffer, bitCount: number): Uint8Array | undefined {
  if (data.length < EWAH_HEADER_LENGTH) {
    return undefined;
  }

  const bitSize: number = data.readUInt32BE(0);
  const wordCount: number = data.readUInt32BE(4);
  if (
    bitSize > bitCount ||
    data.length !== EWAH_HEADER_LENGTH + wordCount * EWAH_WORD_LENGTH + EWAH_MARKER_POSITION_LENGTH
  ) {
    return undefined;
  }

  const bits: Uint8Array = new Uint8Array(bitCount);
  let position: number = 0;
  let wordIndex: number = 0;
  while (wordIndex < wordCount) {
    const markerOffset: number = EWAH_HEADER_LENGTH + wordIndex * EWAH_WORD_LENGTH;
    const markerHigh: number = data.readUInt32BE(markerOffset);
    const markerLow: number = data.readUInt32BE(markerOffset + EWAH_HALF_WORD_LENGTH);
    const runBitCount: number =
      ((markerLow >>> 1) + (markerHigh & 1) * 2 ** (BITS_PER_EWAH_HALF_WORD - 1)) * BITS_PER_EWAH_WORD;
    const literalWordCount: number = markerHigh >>> 1;
    if (markerLow & 1) {
      if (position + runBitCount > bitSize) {
        return undefined;
      }

      bits.fill(1, position, position + runBitCount);
    }

    position += runBitCount;
    wordIndex++;
    if (wordIndex + literalWordCount > wordCount) {
      return undefined;
    }

    for (let i: number = 0; i < literalWordCount; i++, wordIndex++) {
      const wordOffset: number = EWAH_HEADER_LENGTH + wordIndex * EWAH_WORD_LENGTH;
      if (
        !trySetBits(bits, data.readUInt32BE(wordOffset + EWAH_HALF_WORD_LENGTH), position, bitSize) ||
        !trySetBits(bits, data.readUInt32BE(wordOffset), position + BITS_PER_EWAH_HALF_WORD, bitSize)
      ) {
        return undefined;
      }

      position += BITS_PER_EWAH_WORD;
    }
  }

  return bits;
}

function trySetBits(bits: Uint8Array, halfWord: number, position: number, bitSize: number): boolean {
  for (let bit: number = position; halfWord !== 0; bit++, halfWord >>>= 1) {
    if (halfWord & 1) {
      if (bit >= bitSize) {
        return false;
      }

      bits[bit] = 1;
    }
  }

  return true;
}

/**
 * Serializes a flag for each bit as an EWAH bitmap, as Git does. The bitmap ends at the last bit that is set.
 */
export function writeEwahBitmap(bits: Uint8Array): Buffer {
  const bitSize: number = bits.lastIndexOf(1) + 1;
  const literalWordCount: number = Math.ceil(bitSize / BITS_PER_EWAH_WORD);
  const lowHalves: Uint32Array = new Uint32Array(literalWordCount);
  const highHalves: Uint32Array = new Uint32Array(literalWordCount);
  for (let bit: number = 0; bit < bitSize; bit++) {
    if (bits[bit]) {
      const halves: Uint32Array = bit % BITS_PER_EWAH_WORD < BITS_PER_EWAH_HALF_WORD ? lowHalves : highHalves;
      halves[Math.floor(bit / BITS_PER_EWAH_WORD)] |= 1 << bit % BITS_PER_EWAH_HALF_WORD;
    }
  }

  // Each marker word is followed by the literal words that it counts. Only runs of words that are 0 are
  // compressed, so the bitmap has no bit beyond its size. An empty bitmap is one marker word that is 0.
  const words: number[] = [];
  let lastMarkerIndex: number = 0;
  let wordIndex: number = 0;
  do {
    const runStart: number = wordIndex;
    while (
      wordIndex < literalWordCount &&
      lowHalves[wordIndex] === 0 &&
      highHalves[wordIndex] === 0 &&
      wordIndex - runStart < MAX_EWAH_RUN_LENGTH
    ) {
      wordIndex++;
    }

    const runLength: number = wordIndex - runStart;
    const literalStart: number = wordIndex;
    while (
      wordIndex < literalWordCount &&
      (lowHalves[wordIndex] !== 0 || highHalves[wordIndex] !== 0) &&
      wordIndex - literalStart < MAX_EWAH_LITERAL_WORD_COUNT
    ) {
      wordIndex++;
    }

    lastMarkerIndex = words.length / 2;
    const runLengthHigh: number = Math.floor(runLength / 2 ** (BITS_PER_EWAH_HALF_WORD - 1));
    words.push(
      ((wordIndex - literalStart) * 2 + runLengthHigh) >>> 0,
      ((runLength % 2 ** (BITS_PER_EWAH_HALF_WORD - 1)) * 2) >>> 0
    );
    for (let i: number = literalStart; i < wordIndex; i++) {
      words.push(highHalves[i], lowHalves[i]);
    }
  } while (wordIndex < literalWordCount);

  const wordCount: number = words.length / 2;
  const data: Buffer = Buffer.alloc(
    EWAH_HEADER_LENGTH + wordCount * EWAH_WORD_LENGTH + EWAH_MARKER_POSITION_LENGTH
  );
  data.writeUInt32BE(bitSize, 0);
  data.writeUInt32BE(wordCount, 4);
  for (let i: number = 0; i < words.length; i++) {
    data.writeUInt32BE(words[i], EWAH_HEADER_LENGTH + i * EWAH_HALF_WORD_LENGTH);
  }

  data.writeUInt32BE(lastMarkerIndex, EWAH_HEADER_LENGTH + wordCount * EWAH_WORD_LENGTH);
  return data;
}
