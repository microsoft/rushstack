// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IOperationGroupRecord } from './DaemonOperationGroups';
import { readSpawnMarks } from './DaemonOperationGroupSpawnMark';
import { isGroupAndSessionLeader } from './DaemonProcessStat';
import type { IProcessStat } from './DaemonProcessStat';
import type { IReapContext } from './DaemonReapOptions';

// A child's start time is set when it is forked, inside the spawn that its mark brackets. 1 s is over 13 times
// the longest spawn measured from a daemon-sized process.
const SPAWN_WINDOW_TICKS: number = 100;
const NO_MARKS: number = 0;

/** The dead daemon's record folder, what it recorded there, and its marker. */
export interface IOperationGroupAdoptionScope {
  readonly folder: string;
  readonly records: readonly IOperationGroupRecord[];
  readonly marker: string;
}

interface IAdoption {
  readonly context: IReapContext;
  readonly marker: string;
  readonly recorded: ReadonlySet<number>;
  readonly marks: readonly number[];
}

type AdoptionCheck = (stat: IProcessStat, adoption: IAdoption) => boolean;

function startedInSpawn(stat: IProcessStat, marks: readonly number[]): boolean {
  const start: number = Number(stat.startTime);
  return marks.some((mark: number) => start >= mark && start - mark <= SPAWN_WINDOW_TICKS);
}

// A live daemon still owns the processes it starts, and its mark may be of a spawn that is running now.
function isDaemonGone({ ops, deadPid, deadPidReused }: IReapContext): boolean {
  return deadPidReused || !ops.isProcessAlive(deadPid);
}

// The cheap checks come first; the last reads the process's environment.
const ADOPTION_CHECKS: readonly AdoptionCheck[] = [
  (stat: IProcessStat) => isGroupAndSessionLeader(stat) && !stat.exited,
  (stat: IProcessStat, { recorded }: IAdoption) => !recorded.has(stat.pid),
  (stat: IProcessStat, { marks }: IAdoption) => startedInSpawn(stat, marks),
  (stat: IProcessStat, { context, marker }: IAdoption) => context.ops.hasEnvironmentEntry(stat.pid, marker)
];

/**
 * The live processes that the dead daemon may have started without recording them, because it died during the
 * spawn, as records to reap: each leads its own process group and session, no record names its group, it
 * started within 1 s after one of the spawn marks left in the folder, and it carries the daemon's marker.
 * Without a spawn mark, which is every case but a death during a spawn, no process is read; nor while the
 * daemon's pid is alive and not reused.
 */
export function adoptUnrecordedOperationGroups(
  context: IReapContext,
  { folder, records, marker }: IOperationGroupAdoptionScope
): IOperationGroupRecord[] {
  const marks: number[] = readSpawnMarks(folder);
  if (marks.length === NO_MARKS || !isDaemonGone(context)) return [];
  const recorded: Set<number> = new Set(records.map((record: IOperationGroupRecord) => record.groupId));
  const adoption: IAdoption = { context, marker, recorded, marks };
  return context.ops
    .listProcesses()
    .filter((stat: IProcessStat) => ADOPTION_CHECKS.every((check: AdoptionCheck) => check(stat, adoption)))
    .map((stat: IProcessStat) => ({ groupId: stat.pid, startTime: stat.startTime }));
}
