// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { expect } from 'chai';
import * as path from 'path';

import RushConfiguration from '../../../data/RushConfiguration';
import ChangeManager from '../ChangeManager';
import PrereleaseToken from '../PrereleaseToken';

describe('ChangeManager', () => {
  const rushJsonFile: string = path.resolve(__dirname, 'packages', 'rush.json');
  let rushConfiguration: RushConfiguration;
  let changeManager: ChangeManager;

  beforeEach(() => {
    rushConfiguration = RushConfiguration.loadFromConfigurationFile(rushJsonFile);
    changeManager = new ChangeManager(rushConfiguration);
  });

  /* tslint:disable:no-string-literal */
  it('can apply changes to the package.json files in the dictionary', () => {
    changeManager.load(path.join(__dirname, 'multipleChanges'));
    changeManager.apply(false);

    expect(changeManager.allPackages.get('a')!.packageJson.version).equals('2.0.0', 'a was not 2.0.0');
    expect(changeManager.allPackages.get('b')!.packageJson.version).equals('1.0.1', 'b was not patched');
    expect(changeManager.allPackages.get('b')!.packageJson.dependencies!['a']).equals(
      '>=2.0.0 <3.0.0',
      'the "a" dependency in "b" was not updated');
    expect(changeManager.allPackages.get('c')!.packageJson.version).equals('1.0.0', 'c version was changed');
    expect(changeManager.allPackages.get('c')!.packageJson.dependencies!['b']).equals(
      '>=1.0.1 <2.0.0',
      'the "b" dependency in "c" was not updated');
  });

  it('can update explicit version dependency', () => {
    changeManager.load(path.join(__dirname, 'explicitVersionChange'));
    changeManager.apply(false);

    expect(changeManager.allPackages.get('c')!.packageJson.version).equals('1.0.1', 'c was not patched');
    expect(changeManager.allPackages.get('d')!.packageJson.version).equals('1.0.1', 'd was not patched');
    expect(changeManager.allPackages.get('d')!.packageJson.dependencies!['c']).equals(
      '1.0.1',
      'the "c" dependency in "d" was not updated');
  });

  it('can update explicit cyclic dependency', () => {
    changeManager.load(path.join(__dirname, 'cyclicDepsExplicit'));
    changeManager.apply(false);

    expect(changeManager.allPackages.get('cyclic-dep-explicit-1')!.packageJson.version).equals(
      '2.0.0',
      'cyclic-dep-explicit-1 should have been updated.');
    expect(changeManager.allPackages.get('cyclic-dep-explicit-1')!.packageJson.dependencies!['cyclic-dep-explicit-2'])
      .equals(
        '>=1.0.0 <2.0.0',
        'the "cyclic-dep-explicit-2" dependency in "cyclic-dep-explicit-1" should not be updated');
    expect(changeManager.allPackages.get('cyclic-dep-explicit-2')!.packageJson.version).equals(
      '1.0.0',
      'cyclic-dep-explicit-2 should not have patch version update.');
    expect(changeManager.allPackages.get('cyclic-dep-explicit-2')!.packageJson.dependencies!['cyclic-dep-explicit-1'])
      .equals(
        '>=1.0.0 <2.0.0',
        'the "cyclic-dep-explicit-1" dependency in "cyclic-dep-explicit-2" should not be updated');
  });

  it('can update root with patch change for prerelease', () => {
    const prereleaseName: string = 'alpha.1';
    const prereleaseToken: PrereleaseToken = new PrereleaseToken(prereleaseName);

    changeManager.load(path.join(__dirname, 'rootPatchChange'), prereleaseToken);
    changeManager.apply(false);

    expect(changeManager.allPackages.get('a')!.packageJson.version).equals(
      '1.0.1-' + prereleaseName,
      'a should have the prereleased version');
    expect(changeManager.allPackages.get('b')!.packageJson.version).equals(
      '1.0.1-' + prereleaseName,
      'b should have the prereleased version');
    expect(changeManager.allPackages.get('b')!.packageJson.dependencies!['a']).equals(
      '1.0.1-' + prereleaseName,
      'the "a" dependency in "b" should be updated');
    expect(changeManager.allPackages.get('c')!.packageJson.version).equals('1.0.1-' + prereleaseName,
      'c should have the prereleased version');
    expect(changeManager.allPackages.get('d')!.packageJson.version).equals('1.0.1-' + prereleaseName,
      'd should have the prereleased version');
    expect(changeManager.allPackages.get('d')!.packageJson.dependencies!['c']).equals(
      '1.0.1-' + prereleaseName,
      'the "c" dependency in "d" should be updated');
  });

  it('can update non-root with patch change for prerelease', () => {
    const prereleaseName: string = 'beta.1';
    const prereleaseToken: PrereleaseToken = new PrereleaseToken(prereleaseName);

    changeManager.load(path.join(__dirname, 'explicitVersionChange'), prereleaseToken);
    changeManager.apply(false);

    expect(changeManager.allPackages.get('a')!.packageJson.version).equals(
      '1.0.0',
      'a version should not be changed.');
    expect(changeManager.allPackages.get('b')!.packageJson.version).equals(
      '1.0.0',
      'b version should not be changed.');
    expect(changeManager.allPackages.get('b')!.packageJson.dependencies!['a']).equals(
      '>=1.0.0 <2.0.0',
      'the "a" dependency in "b" should not be changed.');
    expect(changeManager.allPackages.get('c')!.packageJson.version).equals('1.0.1-' + prereleaseName,
      'c should have the prereleased version');
    expect(changeManager.allPackages.get('d')!.packageJson.version).equals('1.0.1-' + prereleaseName,
      'd should have the prereleased version');
    expect(changeManager.allPackages.get('d')!.packageJson.dependencies!['c']).equals(
      '1.0.1-' + prereleaseName,
      'the "c" dependency in "d" should be updated');
  });

  it('can update cyclic dependency for non-explicit prerelease', () => {
    const prereleaseName: string = 'beta.1';
    const prereleaseToken: PrereleaseToken = new PrereleaseToken(prereleaseName);

    changeManager.load(path.join(__dirname, 'cyclicDeps'), prereleaseToken);
    changeManager.apply(false);

    expect(changeManager.allPackages.get('cyclic-dep-1')!.packageJson.version).equals(
      '2.0.0-' + prereleaseName,
      'cyclic-dep-1 should have prerelease version.');
    expect(changeManager.allPackages.get('cyclic-dep-1')!.packageJson.dependencies!['cyclic-dep-2']).equals(
      '1.0.1-' + prereleaseName,
      'the "cyclic-dep-2" dependency in "cyclic-dep-1" should be updated');
    expect(changeManager.allPackages.get('cyclic-dep-2')!.packageJson.version).equals(
      '1.0.1-' + prereleaseName,
      'cyclic-dep-2 should have prerelease version.');
    expect(changeManager.allPackages.get('cyclic-dep-2')!.packageJson.dependencies!['cyclic-dep-1']).equals(
      '2.0.0-' + prereleaseName,
      'the "cyclic-dep-1" dependency in "cyclic-dep-2" should be updated');
  });

  it('can update root with patch change for adding version suffix', () => {
    const suffix: string = 'dk.1';
    const prereleaseToken: PrereleaseToken = new PrereleaseToken(undefined, suffix);

    changeManager.load(path.join(__dirname, 'rootPatchChange'), prereleaseToken);
    changeManager.apply(false);

    expect(changeManager.allPackages.get('a')!.packageJson.version).equals(
      '1.0.0-' + suffix,
      'a should have the suffix version');
    expect(changeManager.allPackages.get('b')!.packageJson.version).equals(
      '1.0.0-' + suffix,
      'b should have the suffix version');
    expect(changeManager.allPackages.get('b')!.packageJson.dependencies!['a']).equals(
      '1.0.0-' + suffix,
      'the "a" dependency in "b" should be updated');
    expect(changeManager.allPackages.get('c')!.packageJson.version).equals('1.0.0-' + suffix,
      'c should have the suffix version');
    expect(changeManager.allPackages.get('d')!.packageJson.version).equals('1.0.0-' + suffix,
      'd should have the suffix version');
    expect(changeManager.allPackages.get('d')!.packageJson.dependencies!['c']).equals(
      '1.0.0-' + suffix,
      'the "c" dependency in "d" should be updated');
  });

  it('can update non-root with patch change for version suffix', () => {
    const suffix: string = 'dk.1';
    const prereleaseToken: PrereleaseToken = new PrereleaseToken(undefined, suffix);

    changeManager.load(path.join(__dirname, 'explicitVersionChange'), prereleaseToken);
    changeManager.apply(false);

    expect(changeManager.allPackages.get('a')!.packageJson.version).equals(
      '1.0.0',
      'a version should not be changed.');
    expect(changeManager.allPackages.get('b')!.packageJson.version).equals(
      '1.0.0',
      'b version should not be changed.');
    expect(changeManager.allPackages.get('b')!.packageJson.dependencies!['a']).equals(
      '>=1.0.0 <2.0.0',
      'the "a" dependency in "b" should not be changed.');
    expect(changeManager.allPackages.get('c')!.packageJson.version).equals('1.0.0-' + suffix,
      'c should have the suffix version');
    expect(changeManager.allPackages.get('d')!.packageJson.version).equals('1.0.0-' + suffix,
      'd should have the suffix version');
    expect(changeManager.allPackages.get('d')!.packageJson.dependencies!['c']).equals(
      '1.0.0-' + suffix,
      'the "c" dependency in "d" should be updated');
  });

  it('can update cyclic dependency for non-explicit suffix', () => {
    const suffix: string = 'dk.1';
    const prereleaseToken: PrereleaseToken = new PrereleaseToken(undefined, suffix);

    changeManager.load(path.join(__dirname, 'cyclicDeps'), prereleaseToken);
    changeManager.apply(false);

    expect(changeManager.allPackages.get('cyclic-dep-1')!.packageJson.version).equals(
      '1.0.0-' + suffix,
      'cyclic-dep-1 should have suffix version.');
    expect(changeManager.allPackages.get('cyclic-dep-1')!.packageJson.dependencies!['cyclic-dep-2']).equals(
      '1.0.0-' + suffix,
      'the "cyclic-dep-2" dependency in "cyclic-dep-1" should be updated');
    expect(changeManager.allPackages.get('cyclic-dep-2')!.packageJson.version).equals(
      '1.0.0-' + suffix,
      'cyclic-dep-2 should have prerelease version.');
    expect(changeManager.allPackages.get('cyclic-dep-2')!.packageJson.dependencies!['cyclic-dep-1']).equals(
      '1.0.0-' + suffix,
      'the "cyclic-dep-1" dependency in "cyclic-dep-2" should be updated');
  });
  /* tslint:enable:no-string-literal */
});
