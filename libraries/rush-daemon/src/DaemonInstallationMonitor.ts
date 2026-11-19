// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';

import type {
  DaemonInstallationChangeKind,
  IDaemonInstallationChange
} from '@rushstack/rush-daemon-protocol';

/**
 * Reports a folder of the running daemon's installation that was removed or replaced after startup, or
 * `undefined` while the installation is intact.
 *
 * @beta
 */
export type CheckDaemonInstallation = () => IDaemonInstallationChange | undefined;

interface IFolderIdentity {
  readonly folder: string;
  readonly dev: bigint;
  readonly ino: bigint;
  /** Zero where the file system does not record it; it tells a recreated folder that reused an inode. */
  readonly birthtimeNs: bigint;
}

/**
 * Remembers which folder each path and each of its ancestors named at startup.
 *
 * @remarks
 * A check stats only the given folders. A folder keeps its identity while files inside it change, so only a
 * removed, renamed or recreated folder is reported: the outermost ancestor that no longer exists, or that is now
 * a different folder. Errors other than a missing path are ignored rather than reported, because restarting a
 * daemon whose code is still in place would only lose its warm state.
 *
 * @beta
 */
export function captureDaemonInstallation(folders: ReadonlyArray<string>): CheckDaemonInstallation {
  const chains: IFolderIdentity[][] = [];
  for (const folder of folders) {
    const chain: IFolderIdentity[] | undefined = captureChain(path.resolve(folder));
    if (chain) chains.push(chain);
  }
  return () => {
    for (const chain of chains) {
      if (compareIdentity(chain[chain.length - 1]) === undefined) continue;
      for (const identity of chain) {
        const change: DaemonInstallationChangeKind | undefined = compareIdentity(identity);
        if (change) return { change, folder: identity.folder };
      }
    }
    return undefined;
  };
}

/** The folders this process loaded its code from: its own package's output and the Rush engine. */
export function getDaemonInstallationFolders(): string[] {
  return [__dirname, path.dirname(require.resolve('@microsoft/rush-lib'))];
}

function captureChain(folder: string): IFolderIdentity[] | undefined {
  const ancestors: string[] = [];
  for (let current: string = folder; ; current = path.dirname(current)) {
    ancestors.unshift(current);
    if (path.dirname(current) === current) break;
  }
  const chain: IFolderIdentity[] = [];
  for (const ancestor of ancestors) {
    const stats: fs.BigIntStats | undefined = tryStat(ancestor);
    if (stats)
      chain.push({ folder: ancestor, dev: stats.dev, ino: stats.ino, birthtimeNs: stats.birthtimeNs });
  }
  return chain[chain.length - 1]?.folder === folder ? chain : undefined;
}

function compareIdentity(identity: IFolderIdentity): DaemonInstallationChangeKind | undefined {
  let stats: fs.BigIntStats | undefined;
  try {
    stats = fs.statSync(identity.folder, { bigint: true });
  } catch (error) {
    return isMissing(error) ? 'removed' : undefined;
  }
  return stats.dev === identity.dev &&
    stats.ino === identity.ino &&
    stats.birthtimeNs === identity.birthtimeNs
    ? undefined
    : 'replaced';
}

function tryStat(folder: string): fs.BigIntStats | undefined {
  try {
    return fs.statSync(folder, { bigint: true });
  } catch {
    return undefined;
  }
}

function isMissing(error: unknown): boolean {
  const code: unknown = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}
