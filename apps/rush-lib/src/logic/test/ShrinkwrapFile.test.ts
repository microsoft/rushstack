// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';

import { BaseShrinkwrapFile } from '../base/BaseShrinkwrapFile';
import { ShrinkwrapFileFactory } from '../ShrinkwrapFileFactory';
import { extractVersionFromPnpmVersionSpecifier } from '../pnpm/PnpmShrinkwrapFile';

describe('npm ShrinkwrapFile', () => {
  const filename: string = path.resolve(path.join(__dirname, './shrinkwrapFile/npm-shrinkwrap.json'));
  const shrinkwrapFile: BaseShrinkwrapFile = ShrinkwrapFileFactory.getShrinkwrapFile('npm', filename)!;

  it('verifies root-level dependency', () => {
    expect(shrinkwrapFile.hasCompatibleTopLevelDependency('q', '~1.5.0')).toEqual(true);
  });

  it('verifies temp project dependencies', () => {
    // Found locally
    expect(shrinkwrapFile.tryEnsureCompatibleDependency('jquery', '>=2.2.4 <3.0.0', '@rush-temp/project2'))
      .toEqual(true);
    // Found at root
    expect(shrinkwrapFile.tryEnsureCompatibleDependency('q', '~1.5.0', '@rush-temp/project2'))
      .toEqual(true);
  });

  it('extracts temp projects successfully', () => {
    const tempProjectNames: ReadonlyArray<string> = shrinkwrapFile.getTempProjectNames();

    expect(tempProjectNames).toEqual(['@rush-temp/project1', '@rush-temp/project2' ]);
  });
});

describe('pnpm ShrinkwrapFile', () => {
const filename: string = path.resolve(path.join(
  __dirname, '../../../src/logic/test/shrinkwrapFile/pnpm-lock.yaml'));
const shrinkwrapFile: BaseShrinkwrapFile = ShrinkwrapFileFactory.getShrinkwrapFile('pnpm', filename)!;

  it('verifies root-level dependency', () => {
    expect(shrinkwrapFile.hasCompatibleTopLevelDependency('q', '~1.5.0')).toEqual(false);
  });

  it('verifies temp project dependencies', () => {
    expect(shrinkwrapFile.tryEnsureCompatibleDependency('jquery', '>=2.0.0 <3.0.0', '@rush-temp/project1'))
      .toEqual(true);
    expect(shrinkwrapFile.tryEnsureCompatibleDependency('q', '~1.5.0', '@rush-temp/project2')).toEqual(true);
    expect(shrinkwrapFile.tryEnsureCompatibleDependency('left-pad', '~9.9.9', '@rush-temp/project1')).toEqual(false);
    expect(shrinkwrapFile.tryEnsureCompatibleDependency('@scope/testDep', '>=1.0.0 <2.0.0', '@rush-temp/project3'))
      .toEqual(true);
  });

  it('extracts temp projects successfully', () => {
    const tempProjectNames: ReadonlyArray<string> = shrinkwrapFile.getTempProjectNames();

    expect(tempProjectNames).toEqual(['@rush-temp/project1', '@rush-temp/project2', '@rush-temp/project3']);
  });

  it('can reuse the latest version that another temp package is providing', () => {
    expect(shrinkwrapFile.tryEnsureCompatibleDependency('jquery', '>=2.0.0 <3.0.0', '@rush-temp/project3'))
      .toEqual(true);
  });
});

describe('extractVersionFromPnpmVersionSpecifier', () => {
  it('extracts a simple version with no slashes', () => {
    expect(extractVersionFromPnpmVersionSpecifier('0.0.5')).toEqual('0.0.5');
  });
  it('extracts an unscoped peer dep', () => {
    expect(extractVersionFromPnpmVersionSpecifier('/gulp-karma/0.0.5/karma@0.13.22')).toEqual('0.0.5');
  });
  it('extracts a scoped peer dep', () => {
    expect(extractVersionFromPnpmVersionSpecifier('/@ms/sp-client-utilities/3.1.1/foo@13.1.0')).toEqual('3.1.1');
  });
  it('extracts relative versions', () => {
    expect(extractVersionFromPnpmVersionSpecifier('example.pkgs.visualstudio.com/@scope/testDep/1.0.0'))
      .toEqual('1.0.0');
    expect(extractVersionFromPnpmVersionSpecifier('example.pkgs.visualstudio.com/@scope/testDep/1.2.3-beta.3'))
      .toEqual('1.2.3-beta.3');
  });
  it('extracts a V5 version without a scope', () => {
    expect(extractVersionFromPnpmVersionSpecifier('23.6.0_babel-core@6.26.3')).toEqual('23.6.0');
  });
  it('extracts a V5 peer dependency with a scope', () => {
    expect(extractVersionFromPnpmVersionSpecifier('1.0.3_@pnpm+logger@1.0.2')).toEqual('1.0.3');
  });
  it('handles bad cases', () => {
    expect(extractVersionFromPnpmVersionSpecifier('/foo/gulp-karma/0.0.5/karma@0.13.22')).toEqual(undefined);
    expect(extractVersionFromPnpmVersionSpecifier('/@ms/3.1.1/foo@13.1.0')).toEqual(undefined);
    expect(extractVersionFromPnpmVersionSpecifier('')).toEqual(undefined);
    expect(extractVersionFromPnpmVersionSpecifier('/')).toEqual(undefined);
    expect(extractVersionFromPnpmVersionSpecifier('//')).toEqual(undefined);
    expect(extractVersionFromPnpmVersionSpecifier('/@/')).toEqual(undefined);
    expect(extractVersionFromPnpmVersionSpecifier('example.pkgs.visualstudio.com/@scope/testDep/')).toEqual(undefined);
  });
});
