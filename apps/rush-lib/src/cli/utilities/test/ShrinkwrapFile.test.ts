// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { assert } from 'chai';
import * as path from 'path';

import { BaseShrinkwrapFile } from '../base/BaseShrinkwrapFile';
import { ShrinkwrapFileFactory } from '../ShrinkwrapFileFactory';

describe('npm ShrinkwrapFile', () => {
  const filename: string = path.resolve(path.join(__dirname, './shrinkwrapFile/npm-shrinkwrap.json'));
  const shrinkwrapFile: BaseShrinkwrapFile = ShrinkwrapFileFactory.getShrinkwrapFile('npm', filename)!;

  it('verifies root-level dependency', () => {
    assert.isTrue(shrinkwrapFile.hasCompatibleTopLevelDependency('q', '~1.5.0'));
  });

  it('verifies temp project dependencies', () => {
    // Found locally
    assert.isTrue(shrinkwrapFile.hasCompatibleDependency('jquery', '>=2.2.4 <3.0.0', '@rush-temp/project2'));
    // Found at root
    assert.isTrue(shrinkwrapFile.hasCompatibleDependency('q', '~1.5.0', '@rush-temp/project2'));
  });

  it('extracts temp projects successfully', () => {
    const tempProjectNames: ReadonlyArray<string> = shrinkwrapFile.getTempProjectNames();

    assert.deepEqual(tempProjectNames, ['@rush-temp/project1', '@rush-temp/project2']);
  });
});

describe('pnpm ShrinkwrapFile', () => {
  const filename: string = path.resolve(path.join(
    __dirname, '../../../../src/cli/utilities/test/shrinkwrapFile/shrinkwrap.yaml'));
  const shrinkwrapFile: BaseShrinkwrapFile = ShrinkwrapFileFactory.getShrinkwrapFile('pnpm', filename)!;

  it('verifies root-level dependency', () => {
    assert.isTrue(shrinkwrapFile.hasCompatibleTopLevelDependency('jquery', '>=2.0.0 <3.0.0'));
    assert.isFalse(shrinkwrapFile.hasCompatibleTopLevelDependency('q', '~1.5.0'));
  });

  it('verifies temp project dependencies', () => {
    assert.isTrue(shrinkwrapFile.hasCompatibleDependency('jquery', '>=2.0.0 <3.0.0', '@rush-temp/project1'));
    assert.isTrue(shrinkwrapFile.hasCompatibleDependency('q', '~1.5.0', '@rush-temp/project2'));
    assert.isFalse(shrinkwrapFile.hasCompatibleDependency('left-pad', '~9.9.9', '@rush-temp/project1'));
  });

  it('extracts temp projects successfully', () => {
    const tempProjectNames: ReadonlyArray<string> = shrinkwrapFile.getTempProjectNames();

    assert.deepEqual(tempProjectNames, ['@rush-temp/project1', '@rush-temp/project2']);
  });
});
