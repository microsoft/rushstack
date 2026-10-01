// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { adoptUnrecordedOperationGroups } from '../DaemonOperationGroupAdoption';
import { getOperationGroupsMarker } from '../DaemonOperationGroupMarker';
import { reapDeadDaemonOperationGroupsAsync } from '../DaemonOperationGroupReaper';
import type { IOperationGroupRecord } from '../DaemonOperationGroups';
import type { IDaemonProcessGroupOps } from '../DaemonProcessGroup';
import { createReapContext } from '../DaemonReapOptions';
import type { IDaemonOrphanReaperOptions } from '../DaemonReapOptions';

import { createAdoptionFolder } from './OperationGroupAdoptionFixture';
import type { IAdoptionScene, IMarkedFolder } from './OperationGroupAdoptionFixture';
import { DEAD_PID } from './OrphanReaperFixture';

const NO_CALLS: number = 0;

/** The groups adopted in a scene, whether the whole process table was read, and the groups its reap signaled. */
export interface IAdoptionRun {
  readonly adopted: number[];
  readonly scanned: boolean;
  readonly signaled: number[];
}

/** Adopts in the scene, and then reaps it; `deadPidReused` as the reclaim passes it. */
export async function adoptAndReapAsync(
  scene: IAdoptionScene,
  deadPidReused: boolean = false
): Promise<IAdoptionRun> {
  const { lockfilePath, folder, fake }: IMarkedFolder = createAdoptionFolder(scene);
  const ops: IDaemonProcessGroupOps = fake.options.ops as IDaemonProcessGroupOps;
  const listProcesses: jest.Mock = jest.fn(ops.listProcesses);
  const options: IDaemonOrphanReaperOptions = {
    ...fake.options,
    ops: { ...ops, listProcesses },
    deadPidReused
  };
  const adopted: IOperationGroupRecord[] = adoptUnrecordedOperationGroups(
    createReapContext(DEAD_PID, options),
    { folder, records: scene.records ?? [], marker: getOperationGroupsMarker(folder) }
  );
  await reapDeadDaemonOperationGroupsAsync(lockfilePath, DEAD_PID, options);
  return {
    adopted: adopted.map((record: IOperationGroupRecord) => record.groupId),
    scanned: listProcesses.mock.calls.length > NO_CALLS,
    signaled: [...fake.targets]
  };
}
