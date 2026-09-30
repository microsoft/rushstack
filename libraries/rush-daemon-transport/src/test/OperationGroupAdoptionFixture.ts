// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';

import { getOperationGroupsMarker } from '../DaemonOperationGroupMarker';
import { getOperationGroupsFolder, writeOperationGroupRecord } from '../DaemonOperationGroups';
import type { IOperationGroupRecord } from '../DaemonOperationGroups';
import type { IProcessStat } from '../DaemonProcessStat';

import { DEAD_PID, createFakeGroup } from './OrphanReaperFixture';
import type { IFakeGroup, IFakeGroupSpec } from './OrphanReaperFixture';
import { createTestDaemonPaths } from './TestDaemonFixture';

/** The clock tick of the spawn mark that {@link createMarkedFolder} writes. */
export const MARK: number = 5000;
const IN_WINDOW: number = 5050;
/** The last tick of the 1 s after {@link MARK}. */
export const WINDOW_END: number = 5100;
const ONE_TICK: number = 1;
/** A marker-carrying leader started at the mark. */
export const AT_MARK: number = 7001;
/** A marker-carrying leader started at the end of the window. */
export const AT_WINDOW_END: number = 7002;
const BEFORE_MARK: number = 7003;
const AFTER_WINDOW: number = 7004;
const NO_MARKER: number = 7005;
const OTHER_MARKER: number = 7006;
const NOT_GROUP_LEADER: number = 7007;
const NOT_SESSION_LEADER: number = 7008;
const ZOMBIE: number = 7009;
/** A marker-carrying leader started in the window, which the dead daemon recorded. */
export const RECORDED: number = 7010;
const OTHER_GROUP: number = 7070;
const OTHER_SESSION: number = 7080;
const OTHER_FOLDER: string = `/nonexistent/other.pid.json.groups-${DEAD_PID}`;
const EMPTY_FILE: string = '';

/** A process that leads its own group and session, started at clock tick `start`. */
export function leader(pid: number, start: number, exited: boolean = false): IProcessStat {
  return { pid, groupId: pid, sessionId: pid, startTime: String(start), exited };
}

/** The name of a spawn mark at clock tick `tick`. */
export function markName(tick: number): string {
  return `spawn-${tick}`;
}

// One process per condition of an adoption; only AT_MARK and AT_WINDOW_END meet them all.
const TABLE: readonly IProcessStat[] = [
  leader(AT_MARK, MARK),
  leader(AT_WINDOW_END, WINDOW_END),
  leader(BEFORE_MARK, MARK - ONE_TICK),
  leader(AFTER_WINDOW, WINDOW_END + ONE_TICK),
  leader(NO_MARKER, IN_WINDOW),
  leader(OTHER_MARKER, IN_WINDOW),
  { ...leader(NOT_GROUP_LEADER, IN_WINDOW), groupId: OTHER_GROUP, sessionId: OTHER_GROUP },
  { ...leader(NOT_SESSION_LEADER, IN_WINDOW), sessionId: OTHER_SESSION },
  leader(ZOMBIE, IN_WINDOW, true),
  leader(RECORDED, IN_WINDOW)
];
// NO_MARKER's environment has no marker, or can't be read; OTHER_MARKER carries another daemon folder's marker.
const TABLE_MARKERS: ReadonlyMap<number, string | undefined> = new Map([
  [NO_MARKER, undefined],
  [OTHER_MARKER, getOperationGroupsMarker(OTHER_FOLDER)]
]);

/** The dead daemon's record of {@link RECORDED}. */
export const RECORD: IOperationGroupRecord = { groupId: RECORDED, startTime: String(IN_WINDOW) };

/** A dead daemon's record folder, and the fake process table of its processes. */
export interface IMarkedFolder {
  readonly lockfilePath: string;
  readonly folder: string;
  readonly fake: IFakeGroup;
}

/** The entries of a dead daemon's record folder, and its fake process table, in which SIGTERM ends every group. */
export interface IAdoptionScene extends Omit<IFakeGroupSpec, 'exitsOn'> {
  readonly markNames: readonly string[];
  readonly records?: readonly IOperationGroupRecord[];
}

/** Creates the dead daemon's folder beside a new lockfile, with the scene's records and spawn marks. */
export function createAdoptionFolder({ markNames, records, ...spec }: IAdoptionScene): IMarkedFolder {
  const { lockfilePath } = createTestDaemonPaths();
  const folder: string = getOperationGroupsFolder(lockfilePath, DEAD_PID);
  fs.mkdirSync(folder, { recursive: true });
  records?.forEach((record: IOperationGroupRecord) => writeOperationGroupRecord(folder, record));
  markNames.forEach((name: string) => fs.writeFileSync(path.join(folder, name), EMPTY_FILE));
  return { lockfilePath, folder, fake: createFakeGroup({ ...spec, exitsOn: 'SIGTERM' }) };
}

/** The folder with {@link RECORD} and, unless `mark` is undefined, a spawn mark, and the table of every case. */
export function createMarkedFolder(mark: number | undefined): IMarkedFolder {
  const markNames: string[] = mark === undefined ? [] : [markName(mark)];
  return createAdoptionFolder({ markNames, records: [RECORD], processes: TABLE, markers: TABLE_MARKERS });
}
