// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AT_MARK, MARK, leader, markName } from './OperationGroupAdoptionFixture';
import type { IAdoptionScene } from './OperationGroupAdoptionFixture';
import { adoptAndReapAsync } from './OperationGroupAdoptionRun';
import type { IAdoptionRun } from './OperationGroupAdoptionRun';
import { SELF_PID } from './OrphanReaperFixture';

const OWN_GROUP: number = 1500;
const LATER_MARK: number = 7000;
const LATER_IN_WINDOW: number = 7100;
const BETWEEN_MARKS: number = 6000;
const EARLY_START: number = 50;
const AT_LATER_MARK: number = 8001;
const IN_LATER_WINDOW: number = 8002;
const BETWEEN: number = 8003;
const EARLY: number = 8004;
// Names that are not a spawn mark's; a pattern without its end anchor, or with no digit, would read 0 or 12.
const BAD_MARK_NAMES: string[] = ['spawn-', 'spawn-abc', 'spawn-12x'];

it("never signals the reaper's own process or its own group, which it would otherwise adopt", async () => {
  const run: IAdoptionRun = await adoptAndReapAsync({
    markNames: [markName(MARK)],
    processes: [leader(SELF_PID, MARK), leader(OWN_GROUP, MARK), leader(AT_MARK, MARK)],
    ownGroupId: OWN_GROUP
  });
  expect(run).toEqual({ adopted: [SELF_PID, OWN_GROUP, AT_MARK], scanned: true, signaled: [AT_MARK] });
});

it('reads no process for a spawn mark whose name is not a clock tick, and throws nothing', async () => {
  const run: IAdoptionRun = await adoptAndReapAsync({
    markNames: BAD_MARK_NAMES,
    processes: [leader(EARLY, EARLY_START)]
  });
  expect(run).toEqual({ adopted: [], scanned: false, signaled: [] });
});

it('adopts the processes started within 1 s after any of the spawn marks', async () => {
  const run: IAdoptionRun = await adoptAndReapAsync({
    markNames: [markName(MARK), markName(LATER_MARK)],
    processes: [
      leader(AT_LATER_MARK, LATER_MARK),
      leader(IN_LATER_WINDOW, LATER_IN_WINDOW),
      leader(BETWEEN, BETWEEN_MARKS)
    ]
  });
  const adopted: number[] = [AT_LATER_MARK, IN_LATER_WINDOW];
  expect(run).toEqual({ adopted, scanned: true, signaled: adopted });
});

it("reads no process while the dead daemon's pid is alive, unless another process has reused it", async () => {
  const scene: IAdoptionScene = {
    markNames: [markName(MARK)],
    processes: [leader(AT_MARK, MARK)],
    daemonAlive: true
  };
  const alive: IAdoptionRun = await adoptAndReapAsync(scene);
  const reused: IAdoptionRun = await adoptAndReapAsync(scene, true);
  expect({ alive, reused }).toEqual({
    alive: { adopted: [], scanned: false, signaled: [] },
    reused: { adopted: [AT_MARK], scanned: true, signaled: [AT_MARK] }
  });
});
