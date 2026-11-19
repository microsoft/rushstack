// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { adoptUnrecordedOperationGroups } from '../DaemonOperationGroupAdoption';
import { getOperationGroupsMarker } from '../DaemonOperationGroupMarker';
import { reapDeadDaemonOperationGroupsAsync } from '../DaemonOperationGroupReaper';
import type { IOperationGroupRecord } from '../DaemonOperationGroups';
import type { IDaemonProcessGroupOps } from '../DaemonProcessGroup';
import { createReapContext } from '../DaemonReapOptions';

import {
  AT_MARK,
  AT_WINDOW_END,
  MARK,
  RECORD,
  RECORDED,
  WINDOW_END,
  createMarkedFolder
} from './OperationGroupAdoptionFixture';
import type { IMarkedFolder } from './OperationGroupAdoptionFixture';
import { DEAD_PID } from './OrphanReaperFixture';

it('adopts only unrecorded group and session leaders with the marker, started within 1 s after a mark', () => {
  const { folder, fake }: IMarkedFolder = createMarkedFolder(MARK);
  const adopted: IOperationGroupRecord[] = adoptUnrecordedOperationGroups(
    createReapContext(DEAD_PID, fake.options),
    { folder, records: [RECORD], marker: getOperationGroupsMarker(folder) }
  );
  expect(adopted).toEqual([
    { groupId: AT_MARK, startTime: String(MARK) },
    { groupId: AT_WINDOW_END, startTime: String(WINDOW_END) }
  ]);
});

it('signals each recorded or adopted group once', async () => {
  const { lockfilePath, fake }: IMarkedFolder = createMarkedFolder(MARK);
  await expect(reapDeadDaemonOperationGroupsAsync(lockfilePath, DEAD_PID, fake.options)).resolves.toBe(
    'terminated'
  );
  expect(fake.targets).toEqual([RECORDED, AT_MARK, AT_WINDOW_END]);
});

it('reads no process list without a spawn mark', async () => {
  const { lockfilePath, fake }: IMarkedFolder = createMarkedFolder(undefined);
  const listProcesses: jest.Mock = jest.fn(() => []);
  const ops: IDaemonProcessGroupOps = { ...(fake.options.ops as IDaemonProcessGroupOps), listProcesses };
  await reapDeadDaemonOperationGroupsAsync(lockfilePath, DEAD_PID, { ...fake.options, ops });
  expect(listProcesses).not.toHaveBeenCalled();
  expect(fake.targets).toEqual([RECORDED]);
});
