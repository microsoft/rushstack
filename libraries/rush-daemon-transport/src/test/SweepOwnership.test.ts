// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';

import { sweepStrandedOperationGroupsAsync } from '../DaemonOperationGroupSweep';
import type { IDaemonOrphanReaperOptions } from '../DaemonReapOptions';

import { OPERATION_GROUP, operationTree } from './OperationGroupFixture';
import {
  STRANDED_PID,
  moveBehindLink,
  recordDaemonFolder,
  removeCreatedEntries,
  withLivePids
} from './OperationGroupSweepFixture';
import { SELF_PID, createFakeGroup } from './OrphanReaperFixture';
import type { IFakeGroup } from './OrphanReaperFixture';
import { createTestDaemonPaths } from './TestDaemonFixture';

const posixIt: jest.It = process.platform === 'win32' ? it.skip : it;
const NO_UID: number = 0;
const OTHER_USER_OFFSET: number = 1;
const NO_OWNER: undefined = undefined;

afterEach(removeCreatedEntries);

function createFake(): IFakeGroup {
  return createFakeGroup({ exitsOn: 'SIGTERM', processes: operationTree(OPERATION_GROUP) });
}

posixIt('never signals the groups in a stranded record folder that is a symbolic link', async () => {
  const fake: IFakeGroup = createFake();
  const { lockfilePath } = createTestDaemonPaths();
  const folder: string = recordDaemonFolder(lockfilePath, STRANDED_PID, [OPERATION_GROUP]);
  moveBehindLink(folder);
  await sweepStrandedOperationGroupsAsync(lockfilePath, NO_OWNER, withLivePids(fake, [SELF_PID]));
  expect(fake.signals).toEqual([]);
  expect(fs.lstatSync(folder).isSymbolicLink()).toBe(true);
});

posixIt('never signals the groups in a stranded record folder of another user', async () => {
  const fake: IFakeGroup = createFake();
  const { lockfilePath } = createTestDaemonPaths();
  const folder: string = recordDaemonFolder(lockfilePath, STRANDED_PID, [OPERATION_GROUP]);
  const options: IDaemonOrphanReaperOptions = {
    ...withLivePids(fake, [SELF_PID]),
    uid: (process.getuid?.() ?? NO_UID) + OTHER_USER_OFFSET
  };
  await sweepStrandedOperationGroupsAsync(lockfilePath, NO_OWNER, options);
  expect(fake.signals).toEqual([]);
  expect(fs.existsSync(folder)).toBe(true);
});
