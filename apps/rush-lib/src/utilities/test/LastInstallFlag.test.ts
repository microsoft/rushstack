import { assert } from 'chai';
import * as path from 'path';
import * as fsx from 'fs-extra';

import { LastInstallFlag } from '../LastInstallFlag';

const TEMP_DIR: string = path.join(__dirname, 'temp');

describe('LastInstallFlag', () => {
  before(() => {
    fsx.removeSync(TEMP_DIR);
    fsx.mkdirsSync(TEMP_DIR);
  });

  after(() => {
    fsx.removeSync(TEMP_DIR);
  });

  it('can create and remove a flag in an empty directory', () => {
    // preparation
    const flag: LastInstallFlag = new LastInstallFlag(TEMP_DIR);
    fsx.removeSync(flag.path);

    // test state, should be invalid since the file doesn't exist
    assert.isFalse(flag.isValid());

    // test creation
    flag.create();
    assert.isTrue(fsx.existsSync(flag.path));
    assert.isTrue(flag.isValid());

    // test deletion
    flag.clear();
    assert.isFalse(fsx.existsSync(flag.path));
    assert.isFalse(flag.isValid());
  });

  it('can detect if the last flag was in a different state', () => {
    // preparation
    const flag1: LastInstallFlag = new LastInstallFlag(TEMP_DIR, { node: '5.0.0' });
    const flag2: LastInstallFlag = new LastInstallFlag(TEMP_DIR, { node: '8.9.4' });
    fsx.removeSync(flag1.path);

    // test state, should be invalid since the file doesn't exist
    assert.isFalse(flag1.isValid());
    assert.isFalse(flag2.isValid());

    // test creation
    flag1.create();
    assert.isTrue(fsx.existsSync(flag1.path));
    assert.isTrue(flag1.isValid());

    // the second flag has different state and should be invalid
    assert.isFalse(flag2.isValid());

    // test deletion
    flag1.clear();
    assert.isFalse(fsx.existsSync(flag1.path));
    assert.isFalse(flag1.isValid());
    assert.isFalse(flag2.isValid());
  });

  it('can detect if the last flag was in a corrupted state', () => {
    // preparation, write non-json into flag file
    const flag: LastInstallFlag = new LastInstallFlag(TEMP_DIR);
    fsx.writeFileSync(flag.path, 'sdfjkaklfjksldajgfkld');

    // test state, should be invalid since the file is not JSON
    assert.isFalse(flag.isValid());
    fsx.removeSync(flag.path);
  });
});