// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { getOperationGroupsFolder } from '../DaemonOperationGroups';

import { SPAWNED } from './SpawnStandInFixture';
import type { IStandInRun } from './SpawnStandInFixture';
import { createTestDaemonPaths } from './TestDaemonFixture';

/** What {@link IStandInRun} records of a spawn: everything but the stand-in child. */
export type StandInSteps = Omit<IStandInRun, 'child'>;

/** A new record folder of this process, which does not exist yet. */
export function createRecordFolder(): string {
  return getOperationGroupsFolder(createTestDaemonPaths().lockfilePath, process.pid);
}

/**
 * What a detached spawn that works does: the real spawn runs once, between writing one spawn mark and removing it,
 * the child is recorded once, and the hooked `spawn` returns {@link SPAWNED}; with `changes` applied.
 */
export function expectedSteps(changes: Partial<StandInSteps> = {}): StandInSteps {
  const marksInSpawn: string[] = [expect.stringMatching(/^spawn-\d+$/)];
  return { returned: SPAWNED, spawnCalls: 1, recordCalls: 1, marksInSpawn, marksAfter: [], ...changes };
}

/** The steps of `run`, without its child. */
export function stepsOf(run: IStandInRun): StandInSteps {
  const { returned, thrown, spawnCalls, recordCalls, marksInSpawn, marksAfter } = run;
  return { returned, thrown, spawnCalls, recordCalls, marksInSpawn, marksAfter };
}
