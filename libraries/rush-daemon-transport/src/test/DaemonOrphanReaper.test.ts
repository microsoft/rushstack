// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { reapDeadDaemonProcessGroupAsync } from '../DaemonOrphanReaper';
import type { IDaemonOrphanReaperOptions } from '../DaemonOrphanReaper';
import type { IDaemonProcessGroupOps } from '../DaemonProcessGroup';

const DEAD_PID: number = 4242;
const SELF_PID: number = 1000;
const INIT_PID: number = 1;
const GRACE_MS: number = 100;
const CLOCK_START: number = 0;

interface IFakeGroup {
  readonly signals: NodeJS.Signals[];
  readonly logs: string[];
  readonly options: IDaemonOrphanReaperOptions;
}

interface IFakeGroupSpec {
  readonly daemonAlive?: boolean;
  readonly exitsOn?: NodeJS.Signals;
  readonly ownGroupId?: number;
  readonly anyGroupExists?: boolean;
}

function createFakeGroup(spec: IFakeGroupSpec): IFakeGroup {
  const signals: NodeJS.Signals[] = [];
  const logs: string[] = [];
  let clock: number = CLOCK_START;
  const ops: IDaemonProcessGroupOps = {
    isProcessAlive: () => spec.daemonAlive === true,
    groupExists: (groupId: number) =>
      (spec.anyGroupExists === true || groupId === DEAD_PID) &&
      !signals.some((signal: NodeJS.Signals) => signal === spec.exitsOn),
    signalGroup: (groupId: number, signal: NodeJS.Signals) => signals.push(signal),
    ownGroupId: () => spec.ownGroupId,
    delayAsync: async (ms: number) => {
      clock += ms;
    },
    now: () => clock,
    log: (message: string) => logs.push(message)
  };
  return { signals, logs, options: { ops, platform: 'linux', selfPid: SELF_PID, graceMs: GRACE_MS } };
}

it('stops at SIGTERM when the orphaned group exits within the grace period', async () => {
  const fake: IFakeGroup = createFakeGroup({ exitsOn: 'SIGTERM' });
  await expect(reapDeadDaemonProcessGroupAsync(DEAD_PID, fake.options)).resolves.toBe('terminated');
  expect(fake.signals).toEqual(['SIGTERM']);
  expect(fake.logs).toEqual([expect.stringContaining(`dead daemon ${DEAD_PID}`)]);
});

it('escalates to SIGKILL when the group outlives the grace period', async () => {
  const fake: IFakeGroup = createFakeGroup({ exitsOn: 'SIGKILL' });
  await expect(reapDeadDaemonProcessGroupAsync(DEAD_PID, fake.options)).resolves.toBe('killed');
  expect(fake.signals).toEqual(['SIGTERM', 'SIGKILL']);
  expect(fake.logs).toEqual([expect.stringContaining('killed')]);
});

it('never signals a live daemon (its pid is not proven dead)', async () => {
  const fake: IFakeGroup = createFakeGroup({ daemonAlive: true });
  await expect(reapDeadDaemonProcessGroupAsync(DEAD_PID, fake.options)).resolves.toBe('none');
  expect(fake.signals).toEqual([]);
});

it('never signals when no group with the dead pid remains', async () => {
  const fake: IFakeGroup = createFakeGroup({});
  await expect(reapDeadDaemonProcessGroupAsync(DEAD_PID + INIT_PID, fake.options)).resolves.toBe('none');
  expect(fake.signals).toEqual([]);
  expect(fake.logs).toEqual([]);
});

it.each([INIT_PID, SELF_PID, Number.NaN])('never signals the unsafe group id %p', async (pid: number) => {
  const fake: IFakeGroup = createFakeGroup({ anyGroupExists: true });
  await expect(reapDeadDaemonProcessGroupAsync(pid, fake.options)).resolves.toBe('none');
  expect(fake.signals).toEqual([]);
});

it('never signals the caller own process group, or anything on Windows', async () => {
  const own: IFakeGroup = createFakeGroup({ ownGroupId: DEAD_PID });
  await expect(reapDeadDaemonProcessGroupAsync(DEAD_PID, own.options)).resolves.toBe('none');
  const win: IFakeGroup = createFakeGroup({});
  const winOptions: IDaemonOrphanReaperOptions = { ...win.options, platform: 'win32' };
  await expect(reapDeadDaemonProcessGroupAsync(DEAD_PID, winOptions)).resolves.toBe('none');
  expect([...own.signals, ...win.signals]).toEqual([]);
});
