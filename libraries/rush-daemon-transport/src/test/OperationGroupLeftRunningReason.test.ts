// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { DaemonOperationGroupLeftRunningReason } from '../DaemonReclaimOptions';

import { OPERATION_CHILD, OPERATION_GROUP, operationTree, stat } from './OperationGroupFixture';
import { REUSED_LEADER, reapLeftRunningAsync } from './OperationGroupLeftRunningFixture';
import type { ILeftRunningReap } from './OperationGroupLeftRunningFixture';
import { DEAD_PID } from './OrphanReaperFixture';
import type { IFakeGroupSpec } from './OrphanReaperFixture';

const SHELL_SESSION: number = 3000;
const UNMARKED: ReadonlyMap<number, string | undefined> = new Map([[OPERATION_CHILD, undefined]]);
const OPERATION: IFakeGroupSpec = { processes: operationTree(OPERATION_GROUP) };

it.each<[string, IFakeGroupSpec, DaemonOperationGroupLeftRunningReason]>([
  ['a leader with another start time', { processes: [REUSED_LEADER] }, 'leaderChanged'],
  [
    'a leader in another session',
    { processes: [stat(OPERATION_GROUP, OPERATION_GROUP, SHELL_SESSION)] },
    'leaderChanged'
  ],
  [
    'a leaderless group with a member in another session',
    { processes: [stat(OPERATION_CHILD, OPERATION_GROUP, SHELL_SESSION)] },
    'otherSession'
  ],
  [
    "a leaderless group without the daemon's marker",
    { processes: operationTree(OPERATION_GROUP, false), markers: UNMARKED },
    'noMarker'
  ],
  ["the caller's own group", { ...OPERATION, ownGroupId: OPERATION_GROUP }, 'callerGroup'],
  ['a caller that cannot read its own group', { ...OPERATION, unknownOwnGroup: true }, 'callerGroup'],
  ["a live process with the daemon's PID", { ...OPERATION, daemonAlive: true }, 'daemonPidInUse']
])('reports %s as left running, and signals nothing', async (title, spec, reason) => {
  const { fake, outcome, groups }: ILeftRunningReap = await reapLeftRunningAsync(spec);
  expect(outcome).toBe('none');
  expect(fake.signals).toEqual([]);
  expect(groups).toEqual([{ daemonPid: DEAD_PID, processGroupId: OPERATION_GROUP, reason }]);
});

it.each<[string, IFakeGroupSpec, DaemonOperationGroupLeftRunningReason]>([
  [
    "the caller's own group, while a live process has the daemon's PID",
    { ...OPERATION, ownGroupId: OPERATION_GROUP, daemonAlive: true },
    'callerGroup'
  ],
  [
    "a leader with another start time, while a live process has the daemon's PID",
    { processes: [REUSED_LEADER], daemonAlive: true },
    'daemonPidInUse'
  ],
  [
    "a leaderless group with a member in another session and without the daemon's marker",
    { processes: [stat(OPERATION_CHILD, OPERATION_GROUP, SHELL_SESSION)], markers: UNMARKED },
    'otherSession'
  ]
])(
  'reports %s by the first condition that it fails, in the order of the proof',
  async (title, spec, reason) => {
    const { groups }: ILeftRunningReap = await reapLeftRunningAsync(spec);
    expect(groups).toEqual([{ daemonPid: DEAD_PID, processGroupId: OPERATION_GROUP, reason }]);
  }
);

it("reports the group of the daemon's reused PID, which that PID's new process may lead", async () => {
  const { fake, groups }: ILeftRunningReap = await reapLeftRunningAsync(
    { processes: operationTree(DEAD_PID) },
    { deadPidReused: true }
  );
  expect(fake.signals).toEqual([]);
  expect(groups).toEqual([{ daemonPid: DEAD_PID, processGroupId: DEAD_PID, reason: 'daemonPidInUse' }]);
});
