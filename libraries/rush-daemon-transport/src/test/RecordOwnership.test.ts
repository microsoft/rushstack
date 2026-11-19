// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';

import { DAEMON_PROTOCOL_VERSION } from '@rushstack/rush-daemon-protocol';

import type { IDaemonLockfile } from '../DaemonLockfile';
import { writeDaemonLockfile } from '../DaemonLockfile';
import { reapDeadDaemonOperationGroupsAsync } from '../DaemonOperationGroupReaper';
import { getOperationGroupsFolder } from '../DaemonOperationGroups';
import { reapOrphansOfDeadOwnerAsync } from '../DaemonOrphanReaper';
import type { IDaemonOrphanReaperOptions } from '../DaemonReapOptions';

import { OPERATION_GROUP, operationTree, recordGroups, recordsRemain } from './OperationGroupFixture';
import { DEAD_PID, createFakeGroup } from './OrphanReaperFixture';
import type { IFakeGroup } from './OrphanReaperFixture';

const posixIt: jest.It = process.platform === 'win32' ? it.skip : it;
const NO_UID: number = 0;
const FIRST_INDEX: number = 0;
const EPOCH_MS: number = 0;
const OTHER_USER_OFFSET: number = 1;
const LINK_TARGET_SUFFIX: string = '.target';
const OWNER: IDaemonLockfile = {
  pid: DEAD_PID,
  protocolVersion: DAEMON_PROTOCOL_VERSION,
  startedAt: new Date(EPOCH_MS).toISOString(),
  socketPath: 'unused'
};

const createdEntries: string[] = [];

afterEach(() => {
  for (const entry of createdEntries.splice(FIRST_INDEX)) fs.rmSync(entry, { recursive: true, force: true });
});

function recordOwnGroups(): string {
  const lockfilePath: string = recordGroups([OPERATION_GROUP]);
  for (const entry of [lockfilePath, getOperationGroupsFolder(lockfilePath, DEAD_PID)]) {
    createdEntries.push(entry, `${entry}${LINK_TARGET_SUFFIX}`);
  }
  return lockfilePath;
}

function createFake(): IFakeGroup {
  return createFakeGroup({ exitsOn: 'SIGTERM', processes: operationTree(OPERATION_GROUP) });
}

function asAnotherUser(options: IDaemonOrphanReaperOptions): IDaemonOrphanReaperOptions {
  return { ...options, uid: (process.getuid?.() ?? NO_UID) + OTHER_USER_OFFSET };
}

function moveBehindLink(entryPath: string): void {
  fs.renameSync(entryPath, `${entryPath}${LINK_TARGET_SUFFIX}`);
  fs.symlinkSync(`${entryPath}${LINK_TARGET_SUFFIX}`, entryPath);
}

function recordDeadOwner(): string {
  const lockfilePath: string = recordOwnGroups();
  writeDaemonLockfile(lockfilePath, OWNER);
  return lockfilePath;
}

posixIt('never signals the groups in a record folder that is a symbolic link', async () => {
  const fake: IFakeGroup = createFake();
  const lockfilePath: string = recordOwnGroups();
  moveBehindLink(getOperationGroupsFolder(lockfilePath, DEAD_PID));
  await expect(reapDeadDaemonOperationGroupsAsync(lockfilePath, DEAD_PID, fake.options)).resolves.toBe(
    'none'
  );
  expect(fake.signals).toEqual([]);
  expect(recordsRemain(lockfilePath)).toBe(true);
});

posixIt('never signals the groups in a record folder of another user', async () => {
  const fake: IFakeGroup = createFake();
  const lockfilePath: string = recordOwnGroups();
  const options: IDaemonOrphanReaperOptions = asAnotherUser(fake.options);
  await expect(reapDeadDaemonOperationGroupsAsync(lockfilePath, DEAD_PID, options)).resolves.toBe('none');
  expect(fake.signals).toEqual([]);
});

posixIt('never signals the owner named by a lockfile of another user, or behind a link', async () => {
  const fake: IFakeGroup = createFake();
  const lockfilePath: string = recordDeadOwner();
  await reapOrphansOfDeadOwnerAsync(lockfilePath, OWNER, asAnotherUser(fake.options));
  moveBehindLink(lockfilePath);
  await reapOrphansOfDeadOwnerAsync(lockfilePath, OWNER, fake.options);
  expect(fake.signals).toEqual([]);
});

it('signals the group of the owner named by a lockfile of this user', async () => {
  const fake: IFakeGroup = createFake();
  await reapOrphansOfDeadOwnerAsync(recordDeadOwner(), OWNER, fake.options);
  expect(fake.targets).toEqual([DEAD_PID]);
});
