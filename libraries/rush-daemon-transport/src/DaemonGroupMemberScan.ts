// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { readProcessIds } from './DaemonProcessList';
import { isLiveMemberOf, readStatRecord } from './DaemonProcessStat';

const NO_SIGNAL: number = 0;
const NO_SUCH_PROCESS: string = 'ESRCH';
// Reading a listed process's record fails with these codes once the process is gone.
const GONE_ERROR_CODES: ReadonlySet<string | undefined> = new Set(['ENOENT', NO_SUCH_PROCESS]);

// A listed process whose record cannot be read for another reason (another user's process under the
// `hidepid` mount option, for example) might be a live member, so it counts as one.
function isLiveOrUnreadableMemberOf(groupId: number, pid: number): boolean {
  try {
    return isLiveMemberOf(groupId, readStatRecord(pid));
  } catch (error) {
    return !GONE_ERROR_CODES.has((error as NodeJS.ErrnoException).code);
  }
}

/**
 * `true` while some process of group `groupId` has not exited, as `/proc` shows it. A zombie, which has
 * exited but which its parent has not reaped, does not count. Throws when `/proc` cannot be listed.
 */
export function hasLiveGroupMember(groupId: number): boolean {
  const isMember = (pid: number): boolean => isLiveOrUnreadableMemberOf(groupId, pid);
  // A group's id is its leader's pid, so a live leader answers without reading every process's record.
  return isMember(groupId) || readProcessIds().some(isMember);
}

/**
 * `false` only when `kill` proves that group `groupId` has no process at all, not even a zombie (ESRCH), which
 * spares a scan of every process's record. A group that this user may not signal counts as having members.
 */
export function mayHaveGroupMembers(groupId: number): boolean {
  try {
    process.kill(-groupId, NO_SIGNAL);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException | undefined)?.code !== NO_SUCH_PROCESS;
  }
}
