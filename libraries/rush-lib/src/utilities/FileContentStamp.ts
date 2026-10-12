// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as fs from 'node:fs';

/**
 * A file whose ctime or mtime is newer than this many milliseconds must not be memoized by its stamp.
 *
 * @remarks
 * Every write updates a file's ctime, and userspace can't set it. A stamp recorded for a file whose last change
 * was already this old can't hide a later write, because that write gets a newer ctime even on a filesystem
 * whose timestamps have a coarse granularity (a jiffy on Linux, 2 seconds on FAT). The argument assumes that the
 * filesystem's clock agrees with this process's clock to within this margin, as a local filesystem's does.
 */
export const SETTLED_FILE_AGE_MS: number = 3000;

/** The stamp recorded for a path that doesn't exist. */
export const MISSING_FILE_STAMP: string = 'missing';

/**
 * The ctime and mtime a file must be older than for its stamp to be memoized. Take it before examining any of
 * the files, so that a write made after a file's examination gets a later ctime.
 */
export function getSettledBeforeNs(): bigint {
  return BigInt(Date.now() - SETTLED_FILE_AGE_MS) * BigInt(1e6);
}

/** Identifies a file's content by the identity, size, nanosecond mtime and ctime of the file it reaches. */
export function getFileStamp(stat: fs.BigIntStats): string {
  return `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;
}

/** Whether a file examined after `settledBeforeNs` was taken may be memoized by its stamp. */
export function isFileStatSettled(stat: fs.BigIntStats, settledBeforeNs: bigint): boolean {
  return stat.ctimeNs < settledBeforeNs && stat.mtimeNs < settledBeforeNs;
}
