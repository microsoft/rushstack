// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';

import { sweepStrandedOperationGroupsAsync } from '../DaemonOperationGroupSweep';
import type { IProcessStat } from '../DaemonProcessStat';

import { OPERATION_GROUP, OTHER_OPERATION_GROUP, operationTree, stat } from './OperationGroupFixture';
import {
  OTHER_STRANDED_PID,
  STRANDED_PID,
  recordDaemonFolder,
  recordFolder,
  removeCreatedEntries,
  withLivePids
} from './OperationGroupSweepFixture';
import { SELF_PID, createFakeGroup } from './OrphanReaperFixture';
import type { IFakeGroup } from './OrphanReaperFixture';
import { createTestDaemonPaths } from './TestDaemonFixture';

const LIVE_PID: number = 4303;
const OWNER_PID: number = 4304;
const REUSED_START: string = '999';
const NO_OWNER: undefined = undefined;
// Number() rounds this name to 1e20, whose folder name it is again, but no process can have that pid.
const UNSAFE_PID_NAME: string = '100000000000000000000';

afterEach(removeCreatedEntries);

// OPERATION_GROUP is the operation its record names; OTHER_OPERATION_GROUP's leader is another process.
function createFake(): IFakeGroup {
  const reused: IProcessStat = {
    ...stat(OTHER_OPERATION_GROUP, OTHER_OPERATION_GROUP),
    startTime: REUSED_START
  };
  return createFakeGroup({ exitsOn: 'SIGTERM', processes: [...operationTree(OPERATION_GROUP), reused] });
}

function existing(folders: readonly string[]): string[] {
  return folders.filter((folder: string) => fs.existsSync(folder));
}

it('sweeps the folders of dead daemons that no lockfile names, and signals only proven groups', async () => {
  const fake: IFakeGroup = createFake();
  const { lockfilePath } = createTestDaemonPaths();
  const folders: string[] = [
    recordDaemonFolder(lockfilePath, STRANDED_PID, [OPERATION_GROUP]),
    recordDaemonFolder(lockfilePath, OTHER_STRANDED_PID, [OTHER_OPERATION_GROUP])
  ];
  await sweepStrandedOperationGroupsAsync(lockfilePath, NO_OWNER, withLivePids(fake, [SELF_PID]));
  expect(fake.targets).toEqual([OPERATION_GROUP]);
  expect(fake.logs).toEqual([
    `Reclaimed dead daemon ${STRANDED_PID}: its orphaned operation process groups ` +
      `${OPERATION_GROUP} were terminated.`
  ]);
  expect(existing(folders)).toEqual([]);
});

it('leaves the folders of a live pid (maybe reused), of the lockfile owner and of the caller', async () => {
  const fake: IFakeGroup = createFake();
  const { lockfilePath } = createTestDaemonPaths();
  const folders: string[] = [LIVE_PID, OWNER_PID, SELF_PID].map((pid: number) =>
    recordDaemonFolder(lockfilePath, pid, [OPERATION_GROUP])
  );
  await sweepStrandedOperationGroupsAsync(lockfilePath, OWNER_PID, withLivePids(fake, [LIVE_PID]));
  expect(fake.signals).toEqual([]);
  expect(existing(folders)).toEqual(folders);
});

it('leaves folders that only look like a record folder of the lockfile, or name no real pid', async () => {
  const fake: IFakeGroup = createFake();
  const { lockfilePath } = createTestDaemonPaths();
  const folders: string[] = [
    `${lockfilePath}.groups-0${STRANDED_PID}`,
    `${lockfilePath}.groups-0`,
    `${lockfilePath}.groups--${STRANDED_PID}`,
    `${lockfilePath}.groups-${UNSAFE_PID_NAME}`,
    `${lockfilePath}.groups-${STRANDED_PID}.old`,
    `${lockfilePath}.old.groups-${STRANDED_PID}`
  ].map((folder: string) => recordFolder(folder, [OPERATION_GROUP]));
  await sweepStrandedOperationGroupsAsync(lockfilePath, NO_OWNER, withLivePids(fake, [SELF_PID]));
  expect(fake.signals).toEqual([]);
  expect(existing(folders)).toEqual(folders);
});
