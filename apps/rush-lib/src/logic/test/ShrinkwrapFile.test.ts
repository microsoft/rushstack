// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';

import { BaseShrinkwrapFile } from '../base/BaseShrinkwrapFile';
import { ShrinkwrapFileFactory } from '../ShrinkwrapFileFactory';
import { parsePnpmDependencyKey } from '../pnpm/PnpmShrinkwrapFile';
import { DependencySpecifier } from '../DependencySpecifier';

describe('npm ShrinkwrapFile', () => {
  const filename: string = path.resolve(path.join(__dirname, './shrinkwrapFile/npm-shrinkwrap.json'));
  const shrinkwrapFile: BaseShrinkwrapFile = ShrinkwrapFileFactory.getShrinkwrapFile('npm', {}, filename)!;

  it('verifies root-level dependency', () => {
    expect(shrinkwrapFile.hasCompatibleTopLevelDependency(new DependencySpecifier('q', '~1.5.0'))).toEqual(true);
  });

  it('verifies temp project dependencies', () => {
    // Found locally
    expect(shrinkwrapFile.tryEnsureCompatibleDependency(new DependencySpecifier('jquery', '>=2.2.4 <3.0.0'),
      '@rush-temp/project2'))
      .toEqual(true);
    // Found at root
    expect(shrinkwrapFile.tryEnsureCompatibleDependency(new DependencySpecifier('q', '~1.5.0'), '@rush-temp/project2'))
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
const shrinkwrapFile: BaseShrinkwrapFile = ShrinkwrapFileFactory.getShrinkwrapFile('pnpm', {}, filename)!;

  it('verifies root-level dependency', () => {
    expect(shrinkwrapFile.hasCompatibleTopLevelDependency(new DependencySpecifier('q', '~1.5.0'))).toEqual(false);
  });

  it('verifies temp project dependencies', () => {
    expect(shrinkwrapFile.tryEnsureCompatibleDependency(new DependencySpecifier('jquery', '>=2.0.0 <3.0.0'),
      '@rush-temp/project1'))
      .toEqual(true);
    expect(shrinkwrapFile.tryEnsureCompatibleDependency(
      new DependencySpecifier('q', '~1.5.0'), '@rush-temp/project2')).toEqual(true);
    expect(shrinkwrapFile.tryEnsureCompatibleDependency(
      new DependencySpecifier('left-pad', '~9.9.9'), '@rush-temp/project1')).toEqual(false);
    expect(shrinkwrapFile.tryEnsureCompatibleDependency(
      new DependencySpecifier('@scope/testDep', '>=1.0.0 <2.0.0'), '@rush-temp/project3'))
      .toEqual(true);
  });

  it('extracts temp projects successfully', () => {
    const tempProjectNames: ReadonlyArray<string> = shrinkwrapFile.getTempProjectNames();

    expect(tempProjectNames).toEqual(['@rush-temp/project1', '@rush-temp/project2', '@rush-temp/project3']);
  });

  it('can reuse the latest version that another temp package is providing', () => {
    expect(shrinkwrapFile.tryEnsureCompatibleDependency(new DependencySpecifier('jquery', '>=2.0.0 <3.0.0'),
      '@rush-temp/project3'))
      .toEqual(true);
  });
});

function testParsePnpmDependencyKey(packageName: string, key: string): string | undefined {
  const specifier: DependencySpecifier | undefined = parsePnpmDependencyKey(packageName, key);
  if (!specifier) {
    return undefined;
  }
  return specifier.versionSpecifier;
}

describe('extractVersionFromPnpmVersionSpecifier', () => {
  it('extracts a simple version with no slashes', () => {
    expect(testParsePnpmDependencyKey('anonymous', '0.0.5'))
      .toEqual('0.0.5');
  });
  it('extracts a simple package name', () => {
    expect(testParsePnpmDependencyKey('isarray', '/isarray/2.0.5'))
      .toEqual('2.0.5');
    expect(testParsePnpmDependencyKey('@scope/test-dep', '/@scope/test-dep/1.2.3-beta.3'))
      .toEqual('1.2.3-beta.3');
  });
  it('extracts a registry-qualified path', () => {
    expect(testParsePnpmDependencyKey('@scope/test-dep', 'example.pkgs.visualstudio.com/@scope/test-dep/1.0.0'))
      .toEqual('1.0.0');
    expect(testParsePnpmDependencyKey('@scope/test-dep', 'example.pkgs.visualstudio.com/@scope/test-dep/1.2.3-beta.3'))
      .toEqual('1.2.3-beta.3');
  });
  it('extracts a V3 peer dependency path', () => {
    expect(testParsePnpmDependencyKey('gulp-karma', '/gulp-karma/0.0.5/karma@0.13.22'))
      .toEqual('0.0.5');
    expect(testParsePnpmDependencyKey('sinon-chai', '/sinon-chai/2.8.0/chai@3.5.0+sinon@1.17.7'))
      .toEqual('2.8.0');
    expect(testParsePnpmDependencyKey('@ms/sp-client-utilities', '/@ms/sp-client-utilities/3.1.1/foo@13.1.0'))
      .toEqual('3.1.1');
    expect(testParsePnpmDependencyKey('tslint-microsoft-contrib',
      '/tslint-microsoft-contrib/6.2.0/tslint@5.18.0+typescript@3.5.3'))
      .toEqual('6.2.0');
  });
  it('extracts a V5 peer dependency path', () => {
    expect(testParsePnpmDependencyKey('anonymous', '23.6.0_babel-core@6.26.3'))
      .toEqual('23.6.0');
    expect(testParsePnpmDependencyKey('anonymous', '1.0.7_request@2.88.0'))
      .toEqual('1.0.7');
    expect(testParsePnpmDependencyKey('anonymous', '1.0.3_@pnpm+logger@1.0.2'))
      .toEqual('1.0.3');
    expect(testParsePnpmDependencyKey('tslint-microsoft-contrib',
      '/tslint-microsoft-contrib/6.2.0_tslint@5.18.0+typescript@3.5.3'))
      .toEqual('6.2.0');
  });
  it('detects NPM package aliases', () => {
    expect(testParsePnpmDependencyKey('alias1', '/isarray/2.0.5'))
      .toEqual('npm:isarray@2.0.5');
    expect(testParsePnpmDependencyKey('alias2', '/@ms/sp-client-utilities/3.1.1/foo@13.1.0'))
      .toEqual('npm:@ms/sp-client-utilities@3.1.1');
  });
  it('handles bad cases', () => {
    expect(testParsePnpmDependencyKey('example', '/foo/gulp-karma/0.0.5/karma@0.13.22')).toEqual(undefined);
    expect(testParsePnpmDependencyKey('example', '/@ms/3.1.1/foo@13.1.0')).toEqual(undefined);
    expect(testParsePnpmDependencyKey('example', 'file:projects/my-app.tgz')).toEqual(undefined);
    expect(testParsePnpmDependencyKey('example', '')).toEqual(undefined);
    expect(testParsePnpmDependencyKey('example', '/')).toEqual(undefined);
    expect(testParsePnpmDependencyKey('example', '//')).toEqual(undefined);
    expect(testParsePnpmDependencyKey('example', '/@/')).toEqual(undefined);
    expect(testParsePnpmDependencyKey('example', 'example.pkgs.visualstudio.com/@scope/testDep/')).toEqual(undefined);
  });
});
