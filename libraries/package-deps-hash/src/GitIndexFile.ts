// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// The index format packs flags into bits
/* eslint-disable no-bitwise */

import { createHash } from 'node:crypto';

// The format is described in https://git-scm.com/docs/index-format
const INDEX_SIGNATURE: string = 'DIRC';
const HEADER_LENGTH: number = 12;
// ctime, mtime, dev, ino, mode, uid, gid and size, 4 bytes each except the 8-byte times
const ENTRY_STAT_LENGTH: number = 40;
const ENTRY_MODE_OFFSET: number = 24;
const ENTRY_MODE_LENGTH: number = 4;
const ENTRY_SIZE_OFFSET: number = 36;
const ENTRY_SIZE_LENGTH: number = 4;
const ENTRY_FLAGS_LENGTH: number = 2;
const ENTRY_EXTENDED_FLAG: number = 0x4000;
const EXTENSION_HEADER_LENGTH: number = 8;
const SPLIT_INDEX_EXTENSION_SIGNATURE: string = 'link';

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
 * Summarizes the content of a Git index file of version 2, 3 or 4.
 *
 * @param content - The content of the index file
 * @param objectIdLength - The length of an object ID in bytes: 20 for SHA-1, or 32 for SHA-256
 */
export function summarizeGitIndex(content: Buffer, objectIdLength: number): IGitIndexSummary {
  const entryCount: number | undefined = tryGetGitIndexEntryCount(content);
  if (entryCount === undefined) {
    throw new Error('The file is not a Git index');
  }

  const version: number = content.readUInt32BE(4);
  if (version < 2 || version > 4) {
    throw new Error(`Unsupported Git index version ${version}`);
  }

  const checksumOffset: number = content.length - objectIdLength;
  // Each entry has at least its file system data, object ID and flags, and a NUL after its path
  if (
    HEADER_LENGTH + entryCount * (ENTRY_STAT_LENGTH + objectIdLength + ENTRY_FLAGS_LENGTH + 1) >
    checksumOffset
  ) {
    throw new Error('The Git index ends within an entry');
  }

  // A copy of the entries in which the file system data of each entry is cleared, except for the mode
  const entries: Buffer = Buffer.from(content.subarray(0, checksumOffset));
  const sizes: Buffer = Buffer.alloc(entryCount * ENTRY_SIZE_LENGTH);
  let offset: number = HEADER_LENGTH;
  for (let i: number = 0; i < entryCount; i++) {
    const flagsOffset: number = offset + ENTRY_STAT_LENGTH + objectIdLength;
    if (flagsOffset + ENTRY_FLAGS_LENGTH > checksumOffset) {
      throw new Error('The Git index ends within an entry');
    }

    sizes.writeUInt32BE(content.readUInt32BE(offset + ENTRY_SIZE_OFFSET), i * ENTRY_SIZE_LENGTH);
    entries.fill(0, offset, offset + ENTRY_MODE_OFFSET);
    entries.fill(0, offset + ENTRY_MODE_OFFSET + ENTRY_MODE_LENGTH, offset + ENTRY_STAT_LENGTH);

    const flags: number = content.readUInt16BE(flagsOffset);
    let pathOffset: number = flagsOffset + ENTRY_FLAGS_LENGTH;
    if (flags & ENTRY_EXTENDED_FLAG) {
      // Extended flags follow, for example "skip-worktree" and "intent-to-add"
      pathOffset += ENTRY_FLAGS_LENGTH;
    }

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

    // Before version 4, each entry is padded with 1-8 NULs to a multiple of 8 bytes
    offset = version === 4 ? pathEnd + 1 : offset + ((pathEnd - offset + 8) & ~7);
  }

  const entriesDigest: string = createHash('sha1').update(entries.subarray(4, offset)).digest('hex');
  const sizesDigest: string = createHash('sha1').update(sizes).digest('hex');

  let isSplit: boolean = false;
  while (offset + EXTENSION_HEADER_LENGTH <= checksumOffset) {
    const signature: string = content.toString('latin1', offset, offset + 4);
    if (signature === SPLIT_INDEX_EXTENSION_SIGNATURE) {
      isSplit = true;
    }
    offset += EXTENSION_HEADER_LENGTH + content.readUInt32BE(offset + 4);
  }

  if (offset !== checksumOffset) {
    throw new Error('The extensions of the Git index are malformed');
  }

  return {
    entryCount,
    entriesDigest,
    sizesDigest,
    isSplit
  };
}
