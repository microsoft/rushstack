// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { getOperationGroupsMarker } from '../DaemonOperationGroupMarker';
import { getOperationGroupsFolder } from '../DaemonOperationGroups';
import type { IDaemonProcessGroupOps } from '../DaemonProcessGroup';
import type { IProcessStat } from '../DaemonProcessStat';

const ANY_LOCKFILE: string = '';

/** Describes the processes of a fake process table. */
export interface IFakeProcessSpec {
  /** The signal after which every group is gone; omitted means they never exit. */
  readonly exitsOn?: NodeJS.Signals;
  /** Processes outside the dead daemon's own group, such as detached operation trees. */
  readonly processes?: readonly IProcessStat[];
  /**
   * The only environment entry that each listed pid carries, or `undefined` for none. Every other process carries
   * the marker of the dead daemon's record folder, as the processes that the daemon started do.
   */
  readonly markers?: ReadonlyMap<number, string | undefined>;
}

/** The state of a fake process table that decides which of its processes are alive. */
export interface IFakeProcessTable {
  readonly spec: IFakeProcessSpec;
  readonly signals: readonly NodeJS.Signals[];
}

/** `true` once the table's processes have received the signal after which they are gone. */
export function hasExited(table: IFakeProcessTable): boolean {
  return table.signals.some((signal: NodeJS.Signals) => signal === table.spec.exitsOn);
}

/** The table's processes, or none once they are gone. */
export function liveProcesses(table: IFakeProcessTable): readonly IProcessStat[] {
  return hasExited(table) ? [] : (table.spec.processes ?? []);
}

// Every record folder of daemon `daemonPid` is `<lockfile path>.groups-<daemonPid>`.
function isMarkerOf(daemonPid: number, entry: string): boolean {
  const folderSuffix: string = getOperationGroupsFolder(ANY_LOCKFILE, daemonPid);
  return entry.startsWith(getOperationGroupsMarker(ANY_LOCKFILE)) && entry.endsWith(folderSuffix);
}

function hasEnvironmentEntry(
  table: IFakeProcessTable,
  daemonPid: number,
  pid: number,
  entry: string
): boolean {
  const { markers } = table.spec;
  return markers?.has(pid) === true ? markers.get(pid) === entry : isMarkerOf(daemonPid, entry);
}

/** The process-reading ops of a fake table in which `daemonPid` is the dead daemon. */
export function createProcessOps(
  table: IFakeProcessTable,
  daemonPid: number
): Pick<IDaemonProcessGroupOps, 'readProcessStat' | 'listLiveGroupMembers' | 'hasEnvironmentEntry'> {
  return {
    readProcessStat: (pid: number) => liveProcesses(table).find((stat: IProcessStat) => stat.pid === pid),
    listLiveGroupMembers: (groupId: number) =>
      liveProcesses(table).filter((stat: IProcessStat) => stat.groupId === groupId && !stat.exited),
    hasEnvironmentEntry: (pid: number, entry: string) => hasEnvironmentEntry(table, daemonPid, pid, entry)
  };
}
