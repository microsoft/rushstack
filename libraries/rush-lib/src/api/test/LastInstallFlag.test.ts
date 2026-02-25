// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import { FileSystem } from '@rushstack/node-core-library';

import { LastInstallFlag } from '../LastInstallFlag.ts';

const TEMP_DIR_PATH: string = `${__dirname}/temp`;

describe(LastInstallFlag.name, () => {
  beforeEach(() => {
    FileSystem.ensureEmptyFolder(TEMP_DIR_PATH);
  });

  afterEach(() => {
    FileSystem.ensureEmptyFolder(TEMP_DIR_PATH);
  });

  it('can get correct path', () => {
    const flag: LastInstallFlag = new LastInstallFlag(TEMP_DIR_PATH);
    expect(path.basename(flag.path)).toMatchInlineSnapshot(`"last-install.flag"`);
  });

  it('can create and remove a flag in an empty directory', async () => {
    // preparation
    const flag: LastInstallFlag = new LastInstallFlag(TEMP_DIR_PATH);
    FileSystem.deleteFile(flag.path);

    // test state, should be invalid since the file doesn't exist
    await expect(flag.isValidAsync()).resolves.toEqual(false);

    // test creation
    await flag.createAsync();
    expect(FileSystem.exists(flag.path)).toEqual(true);
    await expect(flag.isValidAsync()).resolves.toEqual(true);

    // test deletion
    await flag.clearAsync();
    expect(FileSystem.exists(flag.path)).toEqual(false);
    await expect(flag.isValidAsync()).resolves.toEqual(false);
  });

  it('can detect if the last flag was in a different state', async () => {
    // preparation
    const flag1: LastInstallFlag = new LastInstallFlag(TEMP_DIR_PATH, { node: '5.0.0' });
    const flag2: LastInstallFlag = new LastInstallFlag(TEMP_DIR_PATH, { node: '8.9.4' });
    FileSystem.deleteFile(flag1.path);

    // test state, should be invalid since the file doesn't exist
    await expect(flag1.isValidAsync()).resolves.toEqual(false);
    await expect(flag2.isValidAsync()).resolves.toEqual(false);

    // test creation
    await flag1.createAsync();
    expect(FileSystem.exists(flag1.path)).toEqual(true);
    await expect(flag1.isValidAsync()).resolves.toEqual(true);

    // the second flag has different state and should be invalid
    await expect(flag2.isValidAsync()).resolves.toEqual(false);

    // test deletion
    await flag1.clearAsync();
    expect(FileSystem.exists(flag1.path)).toEqual(false);
    await expect(flag1.isValidAsync()).resolves.toEqual(false);
    await expect(flag2.isValidAsync()).resolves.toEqual(false);
  });

  it('can detect if the last flag was in a corrupted state', async () => {
    // preparation, write non-json into flag file
    const flag: LastInstallFlag = new LastInstallFlag(TEMP_DIR_PATH);
    FileSystem.writeFile(flag.path, 'sdfjkaklfjksldajgfkld');

    // test state, should be invalid since the file is not JSON
    await expect(flag.isValidAsync()).resolves.toEqual(false);
    FileSystem.deleteFile(flag.path);
  });

  it("throws an error if new storePath doesn't match the old one", async () => {
    const flag1: LastInstallFlag = new LastInstallFlag(TEMP_DIR_PATH, {
      packageManager: 'pnpm',
      storePath: `${TEMP_DIR_PATH}/pnpm-store`
    });
    const flag2: LastInstallFlag = new LastInstallFlag(TEMP_DIR_PATH, {
      packageManager: 'pnpm',
      storePath: `${TEMP_DIR_PATH}/temp-store`
    });

    await flag1.createAsync();
    await expect(async () => {
      await flag2.checkValidAndReportStoreIssuesAsync({ rushVerb: 'install' });
    }).rejects.toThrowError(/PNPM store path/);
  });

  it("doesn't throw an error if conditions for error aren't met", async () => {
    const flag1: LastInstallFlag = new LastInstallFlag(TEMP_DIR_PATH, {
      packageManager: 'pnpm',
      storePath: `${TEMP_DIR_PATH}/pnpm-store`
    });
    const flag2: LastInstallFlag = new LastInstallFlag(TEMP_DIR_PATH, {
      packageManager: 'npm'
    });

    await flag1.createAsync();
    await expect(flag2.checkValidAndReportStoreIssuesAsync({ rushVerb: 'install' })).resolves.not.toThrow();
    await expect(flag2.checkValidAndReportStoreIssuesAsync({ rushVerb: 'install' })).resolves.toEqual(false);
  });
});
