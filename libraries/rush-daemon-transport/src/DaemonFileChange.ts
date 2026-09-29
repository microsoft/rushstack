// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { readFileIdentity } from './DaemonFileIdentity';
import type { IDaemonFileIdentity } from './DaemonFileIdentity';

/**
 * How the file at a path differs from the file that this process created there: `removed` when nothing has
 * the name any more, `replaced` when another file has it.
 *
 * @beta
 */
export type DaemonFileChange = 'removed' | 'replaced';

const REMOVED: DaemonFileChange = 'removed';
const REPLACED: DaemonFileChange = 'replaced';
const NOT_A_DIRECTORY: string = 'ENOTDIR';

interface IFileIdentityRead {
  /** False when the path could not be read for a reason that says nothing about the file. */
  readonly known: boolean;
  readonly identity?: IDaemonFileIdentity;
}

function readIdentity(filePath: string): IFileIdentityRead {
  try {
    return { known: true, identity: readFileIdentity(filePath) };
  } catch (error) {
    // A folder on the path that became a file leaves the name as unreachable as a deletion does.
    return { known: (error as NodeJS.ErrnoException).code === NOT_A_DIRECTORY };
  }
}

function isSameFile(current: IDaemonFileIdentity, expected: IDaemonFileIdentity): boolean {
  return current.dev === expected.dev && current.ino === expected.ino;
}

function compareIdentity(
  current: IDaemonFileIdentity | undefined,
  expected: IDaemonFileIdentity
): DaemonFileChange | undefined {
  if (!current) return REMOVED;
  return isSameFile(current, expected) ? undefined : REPLACED;
}

/**
 * Compares the file at `filePath` with `expected`, the identity of the file this process created there.
 * @returns `undefined` while it is the same file, and also when the path cannot be read for another reason
 * (for example permissions), since that is no evidence that the file changed.
 */
export function compareFileIdentity(
  filePath: string,
  expected: IDaemonFileIdentity
): DaemonFileChange | undefined {
  const read: IFileIdentityRead = readIdentity(filePath);
  return read.known ? compareIdentity(read.identity, expected) : undefined;
}
