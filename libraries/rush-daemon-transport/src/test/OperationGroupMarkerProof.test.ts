// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { getOperationGroupsMarker } from '../DaemonOperationGroupMarker';
import { reapDeadDaemonOperationGroupsAsync } from '../DaemonOperationGroupReaper';
import { getOperationGroupsFolder } from '../DaemonOperationGroups';
import type { IProcessStat } from '../DaemonProcessStat';

import {
  OPERATION_CHILD,
  OPERATION_GROUP,
  operationTree,
  recordGroups,
  recordsRemain,
  stat
} from './OperationGroupFixture';
import { DEAD_PID, createFakeGroup } from './OrphanReaperFixture';
import type { IFakeGroup } from './OrphanReaperFixture';

type Markers = ReadonlyMap<number, string | undefined>;
type MarkersOf = (lockfilePath: string) => Markers;

interface IReap {
  readonly outcome: string;
  readonly fake: IFakeGroup;
}

const NEXT_PID: number = 1;
const OTHER_DAEMON_PID: number = DEAD_PID + NEXT_PID;
const OTHER_WORKSPACE_SUFFIX: string = '.other';
const NO_FOLDER: string = '';
// A group whose leader has exited, with two live members in its session.
const LEADERLESS: readonly IProcessStat[] = [
  ...operationTree(OPERATION_GROUP, false),
  stat(OPERATION_CHILD + NEXT_PID, OPERATION_GROUP)
];

function unmarked(processes: readonly IProcessStat[]): Map<number, string | undefined> {
  return new Map(processes.map((member: IProcessStat) => [member.pid, undefined]));
}

function deadDaemonMarker(lockfilePath: string): string {
  return getOperationGroupsMarker(getOperationGroupsFolder(lockfilePath, DEAD_PID));
}

async function reapAsync(processes: readonly IProcessStat[], markersOf: MarkersOf): Promise<IReap> {
  const lockfilePath: string = recordGroups([OPERATION_GROUP]);
  const fake: IFakeGroup = createFakeGroup({
    exitsOn: 'SIGTERM',
    processes,
    markers: markersOf(lockfilePath)
  });
  const outcome: string = await reapDeadDaemonOperationGroupsAsync(lockfilePath, DEAD_PID, fake.options);
  expect(recordsRemain(lockfilePath)).toBe(false);
  return { outcome, fake };
}

it("never signals a leaderless group none of whose members carries the dead daemon's marker", async () => {
  const { outcome, fake } = await reapAsync(LEADERLESS, () => unmarked(LEADERLESS));
  expect(outcome).toBe('none');
  expect(fake.signals).toEqual([]);
});

it.each<[string, (lockfilePath: string) => string]>([
  [
    'another daemon beside the same lockfile',
    (lockfilePath: string) =>
      getOperationGroupsMarker(getOperationGroupsFolder(lockfilePath, OTHER_DAEMON_PID))
  ],
  [
    'the same daemon pid in another workspace',
    (lockfilePath: string) => deadDaemonMarker(`${lockfilePath}${OTHER_WORKSPACE_SUFFIX}`)
  ],
  ['no folder at all', () => getOperationGroupsMarker(NO_FOLDER)]
])('never signals a leaderless group whose member carries the marker of %s', async (name, markerOf) => {
  const markersOf: MarkersOf = (lockfilePath: string) =>
    new Map([...unmarked(LEADERLESS), [OPERATION_CHILD, markerOf(lockfilePath)]]);
  const { outcome, fake } = await reapAsync(LEADERLESS, markersOf);
  expect(outcome).toBe('none');
  expect(fake.signals).toEqual([]);
});

it("signals a leaderless group when one of its members carries the dead daemon's marker", async () => {
  const markersOf: MarkersOf = (lockfilePath: string) =>
    new Map([...unmarked(LEADERLESS), [OPERATION_CHILD, deadDaemonMarker(lockfilePath)]]);
  const { outcome, fake } = await reapAsync(LEADERLESS, markersOf);
  expect(outcome).toBe('terminated');
  expect(fake.targets).toEqual([OPERATION_GROUP]);
});

it('still signals a group whose leader is alive with the recorded start time without any marker', async () => {
  const tree: readonly IProcessStat[] = operationTree(OPERATION_GROUP);
  const { outcome, fake } = await reapAsync(tree, () => unmarked(tree));
  expect(outcome).toBe('terminated');
  expect(fake.targets).toEqual([OPERATION_GROUP]);
});
