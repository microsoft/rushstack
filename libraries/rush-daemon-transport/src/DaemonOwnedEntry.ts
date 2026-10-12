// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';

/** What a record must be: a regular file or a directory, never a symbolic link. */
export type DaemonOwnedEntryKind = 'file' | 'directory';

const DIRECTORY: DaemonOwnedEntryKind = 'directory';

function isKind(stats: fs.Stats, kind: DaemonOwnedEntryKind): boolean {
  return kind === DIRECTORY ? stats.isDirectory() : stats.isFile();
}

function isOwner(stats: fs.Stats, uid: number | undefined): boolean {
  // Windows has no user ids to compare.
  return uid === undefined || stats.uid === uid;
}

/** `true` when `entryPath` itself (not a link target) is a `kind` that user `uid` owns. */
export function isOwnedEntry(
  entryPath: string,
  kind: DaemonOwnedEntryKind,
  uid: number | undefined
): boolean {
  const stats: fs.Stats | undefined = fs.lstatSync(entryPath, { throwIfNoEntry: false });
  return stats !== undefined && isOwner(stats, uid) && isKind(stats, kind);
}
