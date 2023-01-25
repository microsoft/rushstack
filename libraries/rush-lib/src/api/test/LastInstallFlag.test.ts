// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { FileSystem } from '@rushstack/node-core-library';

import { LastInstallFlag, LAST_INSTALL_FLAG_FILE_NAME } from '../LastInstallFlag';

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
    expect(path.basename(flag.path)).toEqual(LAST_INSTALL_FLAG_FILE_NAME);
  });

  it('can create and remove a flag in an empty directory', () => {
    // preparation
    const flag: LastInstallFlag = new LastInstallFlag(TEMP_DIR_PATH);
    FileSystem.deleteFile(flag.path);

    // test state, should be invalid since the file doesn't exist
    expect(flag.isValid()).toEqual(false);

    // test creation
    flag.create();
    expect(FileSystem.exists(flag.path)).toEqual(true);
    expect(flag.isValid()).toEqual(true);

    // test deletion
    flag.clear();
    expect(FileSystem.exists(flag.path)).toEqual(false);
    expect(flag.isValid()).toEqual(false);
  });

  it('can detect if the last flag was in a different state', () => {
    // preparation
    const flag1: LastInstallFlag = new LastInstallFlag(TEMP_DIR_PATH, { node: '5.0.0' });
    const flag2: LastInstallFlag = new LastInstallFlag(TEMP_DIR_PATH, { node: '8.9.4' });
    FileSystem.deleteFile(flag1.path);

    // test state, should be invalid since the file doesn't exist
    expect(flag1.isValid()).toEqual(false);
    expect(flag2.isValid()).toEqual(false);

    // test creation
    flag1.create();
    expect(FileSystem.exists(flag1.path)).toEqual(true);
    expect(flag1.isValid()).toEqual(true);

    // the second flag has different state and should be invalid
    expect(flag2.isValid()).toEqual(false);

    // test deletion
    flag1.clear();
    expect(FileSystem.exists(flag1.path)).toEqual(false);
    expect(flag1.isValid()).toEqual(false);
    expect(flag2.isValid()).toEqual(false);
  });

  it('can detect if the last flag was in a corrupted state', () => {
    // preparation, write non-json into flag file
    const flag: LastInstallFlag = new LastInstallFlag(TEMP_DIR_PATH);
    FileSystem.writeFile(flag.path, 'sdfjkaklfjksldajgfkld');

    // test state, should be invalid since the file is not JSON
    expect(flag.isValid()).toEqual(false);
    FileSystem.deleteFile(flag.path);
  });

  it("throws an error if new storePath doesn't match the old one", () => {
    const flag1: LastInstallFlag = new LastInstallFlag(TEMP_DIR_PATH, {
      packageManager: 'pnpm',
      storePath: `${TEMP_DIR_PATH}/pnpm-store`
    });
    const flag2: LastInstallFlag = new LastInstallFlag(TEMP_DIR_PATH, {
      packageManager: 'pnpm',
      storePath: `${TEMP_DIR_PATH}/temp-store`
    });

    flag1.create();
    expect(() => {
      flag2.checkValidAndReportStoreIssues({ rushVerb: 'install' });
    }).toThrowError(/PNPM store path/);
  });

  it("doesn't throw an error if conditions for error aren't met", () => {
    const flag1: LastInstallFlag = new LastInstallFlag(TEMP_DIR_PATH, {
      packageManager: 'pnpm',
      storePath: `${TEMP_DIR_PATH}/pnpm-store`
    });
    const flag2: LastInstallFlag = new LastInstallFlag(TEMP_DIR_PATH, {
      packageManager: 'npm'
    });

    flag1.create();
    expect(() => {
      flag2.checkValidAndReportStoreIssues({ rushVerb: 'install' });
    }).not.toThrow();
    expect(flag2.checkValidAndReportStoreIssues({ rushVerb: 'install' })).toEqual(false);
  });

  it("ignores a specified option that doesn't match", () => {
    const flag1: LastInstallFlag = new LastInstallFlag(TEMP_DIR_PATH, {
      option1: 'a',
      option2: 'b'
    });
    const flag2: LastInstallFlag = new LastInstallFlag(TEMP_DIR_PATH, {
      option1: 'a',
      option2: 'c'
    });

    flag1.create();
    expect(() => {
      flag2.isValid({ statePropertiesToIgnore: ['option2'] });
    }).not.toThrow();
    expect(flag2.isValid({ statePropertiesToIgnore: ['option2'] })).toEqual(true);
  });
});
