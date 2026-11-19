// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';

import { readFolderNames, writeOperationGroupsEntry } from './DaemonOperationGroups';

const PROC_UPTIME: string = '/proc/uptime';
const UTF8: BufferEncoding = 'utf8';
// "<seconds>.<hundredths> <idle seconds>": the kernel always prints two digits after the point.
const UPTIME_PATTERN: RegExp = /^(\d+)\.(\d\d) /;
const SECONDS_MATCH: number = 1;
const HUNDREDTHS_MATCH: number = 2;
// USER_HZ, the unit of a `/proc` stat start time, is 100 on every Linux architecture that Node runs on.
const TICKS_PER_SECOND: number = 100;
const MARK_PREFIX: string = 'spawn-';
const MARK_NAME_PATTERN: RegExp = /^spawn-(\d+)$/;
const TICKS_MATCH: number = 1;

/**
 * The clock ticks since boot, from `/proc/uptime`. Both it and a `/proc` stat start time count the boot-time
 * clock and truncate, so a process forked after this read has a start time at least this value. Throws when
 * `/proc/uptime` cannot be read.
 */
export function readUptimeTicks(): number {
  const match: RegExpExecArray | null = UPTIME_PATTERN.exec(fs.readFileSync(PROC_UPTIME, UTF8));
  if (!match) throw new Error(`${PROC_UPTIME} has an unexpected format`);
  return Number(match[SECONDS_MATCH]) * TICKS_PER_SECOND + Number(match[HUNDREDTHS_MATCH]);
}

// Without a mark, only a child that this daemon dies while starting goes without a reap.
function tryWriteSpawnMark(folder: string): string | undefined {
  try {
    const markPath: string = path.join(folder, `${MARK_PREFIX}${readUptimeTicks()}`);
    writeOperationGroupsEntry(markPath);
    return markPath;
  } catch {
    return undefined;
  }
}

// A mark left behind only lets a later reap also consider the children that started just after it.
function tryRemoveSpawnMark(markPath: string): void {
  try {
    fs.rmSync(markPath, { force: true });
  } catch {
    // See above.
  }
}

/**
 * Runs `spawn`, which starts a child and records it; when `detached`, between writing a spawn mark in `folder`
 * and removing it. So if this process dies while it starts a child that leads its own process group, before the
 * child is recorded, the mark is left (see {@link readSpawnMarks}).
 */
export function withSpawnMark<T>(folder: string, detached: boolean, spawn: () => T): T {
  const markPath: string | undefined = detached ? tryWriteSpawnMark(folder) : undefined;
  try {
    return spawn();
  } finally {
    if (markPath !== undefined) tryRemoveSpawnMark(markPath);
  }
}

/** The clock ticks since boot (see {@link readUptimeTicks}) at which the spawns marked in `folder` began. */
export function readSpawnMarks(folder: string): number[] {
  return readFolderNames(folder).flatMap((name: string) => {
    const match: RegExpExecArray | null = MARK_NAME_PATTERN.exec(name);
    return match ? [Number(match[TICKS_MATCH])] : [];
  });
}
