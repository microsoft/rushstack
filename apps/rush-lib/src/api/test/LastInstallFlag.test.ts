import * as path from 'path';
import * as fsx from 'fs-extra';

import { LastInstallFlag } from '../LastInstallFlag';

const TEMP_DIR: string = path.join(__dirname, 'temp');

describe('LastInstallFlag', () => {
  beforeEach(() => {
    fsx.emptyDirSync(TEMP_DIR);
  });

  afterEach(() => {
    fsx.emptyDirSync(TEMP_DIR);
  });

  it('can create and remove a flag in an empty directory', () => {
    // preparation
    const flag: LastInstallFlag = new LastInstallFlag(TEMP_DIR);
    fsx.removeSync(flag.path);

    // test state, should be invalid since the file doesn't exist
    expect(flag.isValid()).toEqual(false);

    // test creation
    flag.create();
    expect(fsx.existsSync(flag.path)).toEqual(true);
    expect(flag.isValid()).toEqual(true);

    // test deletion
    flag.clear();
    expect(fsx.existsSync(flag.path)).toEqual(false);
    expect(flag.isValid()).toEqual(false);
  });

  it('can detect if the last flag was in a different state', () => {
    // preparation
    const flag1: LastInstallFlag = new LastInstallFlag(TEMP_DIR, { node: '5.0.0' });
    const flag2: LastInstallFlag = new LastInstallFlag(TEMP_DIR, { node: '8.9.4' });
    fsx.removeSync(flag1.path);

    // test state, should be invalid since the file doesn't exist
    expect(flag1.isValid()).toEqual(false);
    expect(flag2.isValid()).toEqual(false);

    // test creation
    flag1.create();
    expect(fsx.existsSync(flag1.path)).toEqual(true);
    expect(flag1.isValid()).toEqual(true);

    // the second flag has different state and should be invalid
    expect(flag2.isValid()).toEqual(false);

    // test deletion
    flag1.clear();
    expect(fsx.existsSync(flag1.path)).toEqual(false);
    expect(flag1.isValid()).toEqual(false);
    expect(flag2.isValid()).toEqual(false);
  });

  it('can detect if the last flag was in a corrupted state', () => {
    // preparation, write non-json into flag file
    const flag: LastInstallFlag = new LastInstallFlag(TEMP_DIR);
    fsx.writeFileSync(flag.path, 'sdfjkaklfjksldajgfkld');

    // test state, should be invalid since the file is not JSON
    expect(flag.isValid()).toEqual(false);
    fsx.removeSync(flag.path);
  });
});