// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';

import { getOperationGroupsFolder, writeOperationGroupRecord } from '../DaemonOperationGroups';
import type { IOperationGroupRecord } from '../DaemonOperationGroups';
import type { IProcessStat } from '../DaemonProcessStat';

import { DEAD_PID } from './OrphanReaperFixture';
import { createTestDaemonPaths } from './TestDaemonFixture';

/** The leader pid (and group and session id) of the first fake detached operation. */
export const OPERATION_GROUP: number = 5000;
/** A second fake detached operation. */
export const OTHER_OPERATION_GROUP: number = 6000;
/** The start time recorded for every fake operation leader. */
export const RECORDED_START: string = '777';
const CHILD_OFFSET: number = 1;
/** The pid of the child in {@link OPERATION_GROUP}'s tree. */
export const OPERATION_CHILD: number = OPERATION_GROUP + CHILD_OFFSET;

/** A fake `/proc` stat record for a live process. */
export function stat(pid: number, groupId: number, sessionId: number = groupId): IProcessStat {
  return { pid, groupId, sessionId, startTime: RECORDED_START, exited: false };
}

/** A fake operation tree: the leader (unless it exited) and one child, both in group and session `groupId`. */
export function operationTree(groupId: number, leaderAlive: boolean = true): IProcessStat[] {
  const child: IProcessStat = stat(groupId + CHILD_OFFSET, groupId);
  return leaderAlive ? [stat(groupId, groupId), child] : [child];
}

/** A lockfile path whose dead daemon ({@link DEAD_PID}) recorded `groupIds`. */
export function recordGroups(groupIds: readonly number[]): string {
  const { lockfilePath } = createTestDaemonPaths();
  const folder: string = getOperationGroupsFolder(lockfilePath, DEAD_PID);
  fs.mkdirSync(folder, { recursive: true });
  for (const groupId of groupIds) {
    const record: IOperationGroupRecord = { groupId, startTime: RECORDED_START };
    writeOperationGroupRecord(folder, record);
  }
  return lockfilePath;
}

/** `true` when the dead daemon's records for `lockfilePath` still exist. */
export function recordsRemain(lockfilePath: string): boolean {
  return fs.existsSync(getOperationGroupsFolder(lockfilePath, DEAD_PID));
}
