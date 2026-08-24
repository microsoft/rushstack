// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { IDaemonProtocolVersion } from '@rushstack/rush-daemon-protocol';

import type { IDaemonPaths } from './DaemonPaths';

const UTF8: BufferEncoding = 'utf8';
const NO_SIGNAL: number = 0;
const DIR_MODE: number = 0o700;
const FILE_MODE: number = 0o600;

/** The on-disk contents of a daemon PID/lock file. @beta */
export interface IDaemonLockfile {
  /** The process id of the daemon. */
  readonly pid: number;
  /** The wire protocol version the daemon speaks. */
  readonly protocolVersion: IDaemonProtocolVersion;
  /** The ISO 8601 time the daemon started. */
  readonly startedAt: string;
  /** The socket/pipe path the daemon listens on. */
  readonly socketPath: string;
}

/** Creates the per-user runtime directory (mode `0700`) when the platform has one.
 * Must be called before binding a POSIX socket inside it. @beta */
export function ensureDaemonRuntimeDir(paths: IDaemonPaths): void {
  if (paths.runtimeDir !== undefined) {
    fs.mkdirSync(paths.runtimeDir, { recursive: true, mode: DIR_MODE });
  }
}

/** Returns `true` when a process with `pid` exists and is signalable. @beta */
export function isDaemonProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, NO_SIGNAL);
    return true;
  } catch {
    return false;
  }
}

function isDaemonLockfileRecord(value: unknown): value is IDaemonLockfile {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  return typeof (value as IDaemonLockfile).pid === 'number';
}

/** Reads and parses a daemon lockfile, or returns `undefined` when absent, unreadable,
 * or malformed (a bare reclaim-mutex record carries no daemon `pid`). @beta */
export function readDaemonLockfile(lockfilePath: string): IDaemonLockfile | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(lockfilePath, UTF8));
  } catch {
    return undefined;
  }
  return isDaemonLockfileRecord(parsed) ? parsed : undefined;
}

/** Writes the daemon lockfile, creating the runtime directory when needed. @beta */
export function writeDaemonLockfile(lockfilePath: string, lockfile: IDaemonLockfile): void {
  fs.mkdirSync(path.dirname(lockfilePath), { recursive: true, mode: DIR_MODE });
  fs.writeFileSync(lockfilePath, JSON.stringify(lockfile), { encoding: UTF8, mode: FILE_MODE });
}

/** Removes the daemon lockfile and (on POSIX) the stale socket file; idempotent. @beta */
export function removeDaemonArtifacts(lockfilePath: string, socketPath: string): void {
  for (const filePath of [lockfilePath, socketPath]) {
    try {
      fs.unlinkSync(filePath);
    } catch {
      // Already gone; reclaim is idempotent.
    }
  }
}
