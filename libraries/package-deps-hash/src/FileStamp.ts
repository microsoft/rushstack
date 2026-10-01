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

/**
 * A write gets a newer ctime than a file's last change this many milliseconds earlier, on a filesystem whose
 * timestamps have a fine granularity. It allows for a jiffy on Linux, and for the lag of the kernel's coarse clock
 * behind this process's clock.
 */
const FINE_TIMESTAMP_MARGIN_MS: number = 100;

/**
 * Timestamps that are whole multiples of 10 milliseconds may come from a filesystem whose timestamps have a coarse
 * granularity, such as FAT. Other timestamps have a fine granularity.
 */
const COARSE_TIMESTAMP_UNIT_NS: bigint = BigInt(1e7);

const NANOSECONDS_PER_MILLISECOND: bigint = BigInt(1e6);

/**
 * Whether any write to a file made at or after `timeNs` changes the stamp of the file from the stamp of `stats`.
 *
 * @remarks
 * Every write updates the file's ctime, and userspace can't set it. The write gets a newer ctime unless the file's
 * last change falls within the granularity of the filesystem's timestamps before it.
 */
export function revealsWriteAfter(stats: fs.BigIntStats, timeNs: bigint): boolean {
  const marginMs: number =
    stats.ctimeNs % COARSE_TIMESTAMP_UNIT_NS === BigInt(0) ? SETTLED_FILE_AGE_MS : FINE_TIMESTAMP_MARGIN_MS;
  return stats.ctimeNs < timeNs - BigInt(marginMs) * NANOSECONDS_PER_MILLISECOND;
}

/**
 * The current time, in nanoseconds since the epoch, to compare with the times of files.
 */
export function getTimeNs(): bigint {
  return BigInt(Date.now()) * NANOSECONDS_PER_MILLISECOND;
}

/**
 * The ctime and mtime a file must be older than for its stamp to be memoized. Take it before examining any of
 * the files, so that a write made after a file's examination gets a later ctime.
 */
export function getSettledBeforeNs(): bigint {
  return BigInt(Date.now() - SETTLED_FILE_AGE_MS) * BigInt(1e6);
}

/** Identifies a file's content by the identity, size, nanosecond mtime and ctime of the file. */
export function getFileStamp(stats: fs.BigIntStats): string {
  return `${stats.dev}:${stats.ino}:${stats.size}:${stats.mtimeNs}:${stats.ctimeNs}`;
}

/** Whether a file examined after `settledBeforeNs` was taken may be memoized by its stamp. */
export function isFileStatSettled(stats: fs.BigIntStats, settledBeforeNs: bigint): boolean {
  return stats.ctimeNs < settledBeforeNs && stats.mtimeNs < settledBeforeNs;
}
