// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';

import { getOperationGroupsFolder } from '../DaemonOperationGroups';

import { OPERATION_GROUP, recordGroups } from './OperationGroupFixture';
import { DEAD_PID } from './OrphanReaperFixture';
import { createTestDaemonPaths } from './TestDaemonFixture';
import { removeTestKeyEntries } from './TestDaemonKeys';

it("removes what this file's keys left in the shared runtime directory, and no other file's entries", () => {
  const recorded: string = recordGroups([OPERATION_GROUP]);
  const { lockfilePath } = createTestDaemonPaths();
  const entries: string[] = [lockfilePath, `${lockfilePath}.log`];
  for (const entry of entries) fs.writeFileSync(entry, '{}');
  // The same pid as this file's keys, as another test file in this worker would have.
  const foreign: string = path.join(path.dirname(lockfilePath), `rushd-test-${process.pid}-other.pid.json`);
  fs.writeFileSync(foreign, '{}');
  try {
    removeTestKeyEntries();
    expect(fs.existsSync(getOperationGroupsFolder(recorded, DEAD_PID))).toBe(false);
    expect(entries.filter((entry: string) => fs.existsSync(entry))).toEqual([]);
    expect(fs.existsSync(foreign)).toBe(true);
  } finally {
    fs.rmSync(foreign, { force: true });
  }
});

interface IModuleCopy {
  firstKey: string;
  removeEntries: () => void;
}

async function loadCopyAsync(): Promise<IModuleCopy> {
  const { resolveTestKeyPaths, removeTestKeyEntries: removeEntries } = await import('./TestDaemonKeys');
  return { firstKey: path.basename(resolveTestKeyPaths({}).lockfilePath), removeEntries };
}

it('gives each test file keys of its own, and has it remove their entries after its last test', async () => {
  const hooks: jest.ProvidesHookCallback[] = [];
  const spy: jest.SpyInstance = jest
    .spyOn(global, 'afterAll')
    .mockImplementation((hook: jest.ProvidesHookCallback) => hooks.push(hook));
  const copies: IModuleCopy[] = [];
  try {
    // Fresh copies of the module, as two test files in one Jest worker get.
    await jest.isolateModulesAsync(async () => {
      copies.push(await loadCopyAsync());
    });
    await jest.isolateModulesAsync(async () => {
      copies.push(await loadCopyAsync());
    });
    const [firstFileKey, secondFileKey] = copies.map((copy: IModuleCopy) => copy.firstKey);
    expect(secondFileKey).not.toBe(firstFileKey);
    expect(hooks).toEqual(copies.map((copy: IModuleCopy) => copy.removeEntries));
  } finally {
    spy.mockRestore();
  }
});
