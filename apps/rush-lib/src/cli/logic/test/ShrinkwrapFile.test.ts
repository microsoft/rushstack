// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { assert } from 'chai';
import * as path from 'path';

import { BaseShrinkwrapFile } from '../base/BaseShrinkwrapFile';
import { ShrinkwrapFileFactory } from '../ShrinkwrapFileFactory';
import { extractVersionFromPnpmVersionSpecifier } from '../pnpm/PnpmShrinkwrapFile';

describe('npm ShrinkwrapFile', () => {
  const filename: string = path.resolve(path.join(__dirname, './shrinkwrapFile/npm-shrinkwrap.json'));
  const shrinkwrapFile: BaseShrinkwrapFile = ShrinkwrapFileFactory.getShrinkwrapFile('npm', filename)!;

  it('verifies root-level dependency', () => {
    assert.isTrue(shrinkwrapFile.hasCompatibleTopLevelDependency('q', '~1.5.0'));
  });

  it('verifies temp project dependencies', () => {
    // Found locally
    assert.isTrue(shrinkwrapFile.tryEnsureCompatibleDependency('jquery', '>=2.2.4 <3.0.0', '@rush-temp/project2'));
    // Found at root
    assert.isTrue(shrinkwrapFile.tryEnsureCompatibleDependency('q', '~1.5.0', '@rush-temp/project2'));
  });

  it('extracts temp projects successfully', () => {
    const tempProjectNames: ReadonlyArray<string> = shrinkwrapFile.getTempProjectNames();

    assert.deepEqual(tempProjectNames, ['@rush-temp/project1', '@rush-temp/project2' ]);
  });
});

describe('pnpm ShrinkwrapFile', () => {
const filename: string = path.resolve(path.join(
  __dirname, '../../../../src/cli/logic/test/shrinkwrapFile/shrinkwrap.yaml'));
const shrinkwrapFile: BaseShrinkwrapFile = ShrinkwrapFileFactory.getShrinkwrapFile('pnpm', filename)!;

  it('verifies root-level dependency', () => {
    assert.isFalse(shrinkwrapFile.hasCompatibleTopLevelDependency('q', '~1.5.0'));
  });

  it('verifies temp project dependencies', () => {
    assert.isTrue(shrinkwrapFile.tryEnsureCompatibleDependency('jquery', '>=2.0.0 <3.0.0', '@rush-temp/project1'));
    assert.isTrue(shrinkwrapFile.tryEnsureCompatibleDependency('q', '~1.5.0', '@rush-temp/project2'));
    assert.isFalse(shrinkwrapFile.tryEnsureCompatibleDependency('left-pad', '~9.9.9', '@rush-temp/project1'));
  });

  it('extracts temp projects successfully', () => {
    const tempProjectNames: ReadonlyArray<string> = shrinkwrapFile.getTempProjectNames();

    assert.deepEqual(tempProjectNames, ['@rush-temp/project1', '@rush-temp/project2', '@rush-temp/project3']);
  });

  it('can reuse the latest version that another temp package is providing', () => {
    assert.isTrue(shrinkwrapFile.tryEnsureCompatibleDependency('jquery', '>=2.0.0 <3.0.0', '@rush-temp/project3'));
  });
});

describe('extractVersionFromPnpmVersionSpecifier', () => {
  it('extracts a simple version with no slashes', () => {
    assert.equal(extractVersionFromPnpmVersionSpecifier('0.0.5'), '0.0.5');
  });
  it('extracts an unscoped peer dep', () => {
    assert.equal(extractVersionFromPnpmVersionSpecifier('/gulp-karma/0.0.5/karma@0.13.22'), '0.0.5');
  });
  it('extracts a scoped peer dep', () => {
    assert.equal(extractVersionFromPnpmVersionSpecifier('/@ms/sp-client-utilities/3.1.1/foo@13.1.0'), '3.1.1');
  });
  it('handles bad cases', () => {
    assert.equal(extractVersionFromPnpmVersionSpecifier('/foo/gulp-karma/0.0.5/karma@0.13.22'), undefined);
    assert.equal(extractVersionFromPnpmVersionSpecifier('/@ms/3.1.1/foo@13.1.0'), undefined);
    assert.equal(extractVersionFromPnpmVersionSpecifier(''), undefined);
    assert.equal(extractVersionFromPnpmVersionSpecifier('/'), undefined);
    assert.equal(extractVersionFromPnpmVersionSpecifier('//'), undefined);
    assert.equal(extractVersionFromPnpmVersionSpecifier('/@/'), undefined);
  });
});
