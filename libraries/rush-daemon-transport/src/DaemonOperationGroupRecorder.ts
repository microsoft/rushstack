// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ChildProcess } from 'node:child_process';
import * as diagnosticsChannel from 'node:diagnostics_channel';

import { markOperationGroups } from './DaemonOperationGroupMarker';
import type { UnmarkOperationGroups } from './DaemonOperationGroupMarker';
import {
  removeOperationGroupRecord,
  removeOperationGroupRecords,
  writeOperationGroupRecord
} from './DaemonOperationGroups';
import type { IOperationGroupRecord } from './DaemonOperationGroups';
import { recordOnSpawn } from './DaemonOperationGroupSpawnHook';
import { isGroupAndSessionLeader, readProcessStat } from './DaemonProcessStat';
import type { IProcessStat } from './DaemonProcessStat';

// Node publishes every new ChildProcess on this built-in channel (since v16.18; built-in channels are
// experimental). If it ever stops publishing, nothing is recorded and reclaim falls back to the daemon group.
const CHILD_PROCESS_CHANNEL: string = 'child_process';
const CLOSE_EVENT: string = 'close';

interface IChildProcessMessage {
  readonly process: ChildProcess;
}

/** Stops recording and deletes the records; call it when the daemon releases its lockfile. */
export type StopOperationGroupRecording = () => void;

function bestEffort(action: () => void): void {
  try {
    action();
  } catch {
    // A lost record only means this group is not reaped if the daemon later dies uncleanly.
  }
}

function recordWhileRunning(child: ChildProcess, folder: string): void {
  // Right after the spawn, or on 'spawn' one tick later: either way before the child can be reaped, so its pid is
  // still its own. A `detached` child (SubprocessTerminator.RECOMMENDED_OPTIONS on POSIX) leads its own group
  // and session, so it is outside the daemon's process group and needs a record of its own.
  const stat: IProcessStat | undefined = child.pid === undefined ? undefined : readProcessStat(child.pid);
  if (!isGroupAndSessionLeader(stat)) return;
  const record: IOperationGroupRecord = { groupId: stat.pid, startTime: stat.startTime };
  bestEffort(() => writeOperationGroupRecord(folder, record));
  child.once(CLOSE_EVENT, () => bestEffort(() => removeOperationGroupRecord(folder, record)));
}

/**
 * Records every child this process spawns into its own process group and session, until that child exits,
 * so that a successor can reap them if this daemon dies without killing them (SIGKILL, OOM).
 *
 * @remarks
 * Linux only: records need `/proc` start times to rule out pid reuse. Elsewhere this records nothing.
 * A child is recorded as soon as Node's spawn has started it, before any other code runs. While a `detached`
 * child is being started, `folder` also holds a spawn mark, so a successor can stop a child that this daemon
 * died while starting, before its record was written (see `reapDeadDaemonOperationGroupsAsync`).
 * While it records, `process.env` carries `RUSHD_OPERATION_GROUPS` set to `folder`, which every process
 * started from then on inherits unless it is given an environment without it; a successor signals a recorded
 * group whose leader has exited only when one of its live members carries it.
 */
export function startOperationGroupRecording(folder: string): StopOperationGroupRecording {
  if (readProcessStat(process.pid) === undefined) return () => undefined;
  const unmark: UnmarkOperationGroups = markOperationGroups(folder);
  const onChildProcess = (message: unknown): void => {
    const child: ChildProcess = (message as IChildProcessMessage).process;
    recordOnSpawn(child, { folder, record: () => recordWhileRunning(child, folder) });
  };
  diagnosticsChannel.subscribe(CHILD_PROCESS_CHANNEL, onChildProcess);
  return () => {
    diagnosticsChannel.unsubscribe(CHILD_PROCESS_CHANNEL, onChildProcess);
    unmark();
    bestEffort(() => removeOperationGroupRecords(folder));
  };
}
