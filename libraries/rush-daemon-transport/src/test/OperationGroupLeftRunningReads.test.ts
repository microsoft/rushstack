// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IDaemonProcessGroupOps } from '../DaemonProcessGroup';
import type { IDaemonOrphanReaperOptions } from '../DaemonReapOptions';

import { OPERATION_CHILD, OPERATION_GROUP, operationTree } from './OperationGroupFixture';
import { reapLeftRunningAsync } from './OperationGroupLeftRunningFixture';
import type { ILeftRunningReap } from './OperationGroupLeftRunningFixture';
import { DEAD_PID, createFakeGroup } from './OrphanReaperFixture';
import type { IFakeGroup, IFakeGroupSpec } from './OrphanReaperFixture';

const ONCE: number = 1;
const TWICE: number = 2;
// A group whose leader has exited, and whose only member lacks the dead daemon's marker.
const UNMARKED_LEADERLESS: IFakeGroupSpec = {
  processes: operationTree(OPERATION_GROUP, false),
  markers: new Map([[OPERATION_CHILD, undefined]])
};

interface ICountedReads {
  readonly options: IDaemonOrphanReaperOptions;
  readonly readProcessStat: jest.Mock;
  readonly listLiveGroupMembers: jest.Mock;
}

// A fake table of UNMARKED_LEADERLESS whose reads are counted, with mayHaveMembers replaced.
function countReads(mayHaveMembers: IDaemonProcessGroupOps['mayHaveMembers']): ICountedReads {
  const fake: IFakeGroup = createFakeGroup({ exitsOn: 'SIGTERM', ...UNMARKED_LEADERLESS });
  const ops: IDaemonProcessGroupOps = fake.options.ops as IDaemonProcessGroupOps;
  const readProcessStat: jest.Mock = jest.fn(ops.readProcessStat);
  const listLiveGroupMembers: jest.Mock = jest.fn(ops.listLiveGroupMembers);
  const counted: IDaemonProcessGroupOps = { ...ops, readProcessStat, listLiveGroupMembers, mayHaveMembers };
  return { options: { ...fake.options, ops: counted }, readProcessStat, listLiveGroupMembers };
}

it('judges a leaderless group on what the proof read, and reads it only once', async () => {
  const counted: ICountedReads = countReads(() => true);
  const { outcome, groups }: ILeftRunningReap = await reapLeftRunningAsync(
    UNMARKED_LEADERLESS,
    counted.options
  );
  expect(outcome).toBe('none');
  expect(groups).toEqual([{ daemonPid: DEAD_PID, processGroupId: OPERATION_GROUP, reason: 'noMarker' }]);
  expect(counted.readProcessStat).toHaveBeenCalledTimes(ONCE);
  expect(counted.listLiveGroupMembers).toHaveBeenCalledTimes(ONCE);
});

it('reports no group whose processes have all been reaped since the proof read it', async () => {
  const mayHaveMembers: jest.Mock = jest.fn().mockReturnValueOnce(true).mockReturnValue(false);
  const counted: ICountedReads = countReads(mayHaveMembers);
  const { groups }: ILeftRunningReap = await reapLeftRunningAsync(UNMARKED_LEADERLESS, counted.options);
  expect(groups).toEqual([]);
  expect(mayHaveMembers).toHaveBeenCalledTimes(TWICE);
  expect(counted.listLiveGroupMembers).toHaveBeenCalledTimes(ONCE);
});
