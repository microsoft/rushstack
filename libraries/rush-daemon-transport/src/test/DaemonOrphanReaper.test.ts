// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { reapDeadDaemonProcessGroupAsync } from '../DaemonOrphanReaper';
import type { IDaemonOrphanReaperOptions } from '../DaemonOrphanReaper';

import { DEAD_PID, SELF_PID, createFakeGroup } from './OrphanReaperFixture';
import type { IFakeGroup } from './OrphanReaperFixture';

const INIT_PID: number = 1;

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

it('fails the reclaim when the group is still present after SIGKILL', async () => {
  const fake: IFakeGroup = createFakeGroup({});
  await expect(reapDeadDaemonProcessGroupAsync(DEAD_PID, fake.options)).rejects.toThrow(/survived SIGKILL/);
  expect(fake.signals).toEqual(['SIGTERM', 'SIGKILL']);
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
  const fake: IFakeGroup = createFakeGroup({ anyGroupExists: true, ownGroupId: DEAD_PID + INIT_PID });
  await expect(reapDeadDaemonProcessGroupAsync(pid, fake.options)).resolves.toBe('none');
  expect(fake.signals).toEqual([]);
});

it('never signals the caller own process group, or when that group is unknown', async () => {
  const own: IFakeGroup = createFakeGroup({ ownGroupId: DEAD_PID });
  await expect(reapDeadDaemonProcessGroupAsync(DEAD_PID, own.options)).resolves.toBe('none');
  const unknown: IFakeGroup = createFakeGroup({ unknownOwnGroup: true });
  await expect(reapDeadDaemonProcessGroupAsync(DEAD_PID, unknown.options)).resolves.toBe('none');
  expect([...own.signals, ...unknown.signals]).toEqual([]);
});

it('never signals anything on Windows', async () => {
  const win: IFakeGroup = createFakeGroup({});
  const winOptions: IDaemonOrphanReaperOptions = { ...win.options, platform: 'win32' };
  await expect(reapDeadDaemonProcessGroupAsync(DEAD_PID, winOptions)).resolves.toBe('none');
  expect(win.signals).toEqual([]);
});
