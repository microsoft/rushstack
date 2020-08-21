// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';

import { RushConfiguration } from '../../api/RushConfiguration';
import { ChangeManager } from '../ChangeManager';
import { PrereleaseToken } from '../PrereleaseToken';

describe('ChangeManager', () => {
  const rushJsonFile: string = path.resolve(__dirname, 'packages', 'rush.json');
  let rushConfiguration: RushConfiguration;
  let changeManager: ChangeManager;

  beforeEach(() => {
    rushConfiguration = RushConfiguration.loadFromConfigurationFile(rushJsonFile);
    changeManager = new ChangeManager(rushConfiguration);
  });

  /* eslint-disable dot-notation */
  it('can apply changes to the package.json files in the dictionary', () => {
    changeManager.load(path.join(__dirname, 'multipleChanges'));
    changeManager.apply(false);

    expect(changeManager.allPackages.get('a')!.packageJson.version).toEqual('2.0.0');
    expect(changeManager.allPackages.get('b')!.packageJson.version).toEqual('1.0.1');
    expect(changeManager.allPackages.get('b')!.packageJson.dependencies!['a']).toEqual('>=2.0.0 <3.0.0');
    expect(changeManager.allPackages.get('e')!.packageJson.devDependencies!['a']).toEqual('>=2.0.0 <3.0.0');
    expect(changeManager.allPackages.get('e')!.packageJson.peerDependencies!['a']).toEqual('>=2.0.0 <3.0.0');
    expect(changeManager.allPackages.get('c')!.packageJson.version).toEqual('1.0.0');
    expect(changeManager.allPackages.get('c')!.packageJson.dependencies!['b']).toEqual('>=1.0.1 <2.0.0');
    expect(changeManager.allPackages.get('f')!.packageJson.devDependencies!['b']).toEqual('>=1.0.1 <2.0.0');
    expect(changeManager.allPackages.get('f')!.packageJson.peerDependencies!['b']).toEqual('>=1.0.1 <2.0.0');
  });

  it('can update explicit version dependency', () => {
    changeManager.load(path.join(__dirname, 'explicitVersionChange'));
    changeManager.apply(false);

    expect(changeManager.allPackages.get('c')!.packageJson.version).toEqual('1.0.1');
    expect(changeManager.allPackages.get('d')!.packageJson.version).toEqual('1.0.1');
    expect(changeManager.allPackages.get('d')!.packageJson.dependencies!['c']).toEqual('1.0.1');
  });

  it('can update explicit cyclic dependency', () => {
    changeManager.load(path.join(__dirname, 'cyclicDepsExplicit'));
    changeManager.apply(false);

    expect(changeManager.allPackages.get('cyclic-dep-explicit-1')!.packageJson.version).toEqual('2.0.0');
    expect(
      changeManager.allPackages.get('cyclic-dep-explicit-1')!.packageJson.dependencies![
        'cyclic-dep-explicit-2'
      ]
    ).toEqual('>=1.0.0 <2.0.0');
    expect(changeManager.allPackages.get('cyclic-dep-explicit-2')!.packageJson.version).toEqual('1.0.0');
    expect(
      changeManager.allPackages.get('cyclic-dep-explicit-2')!.packageJson.dependencies![
        'cyclic-dep-explicit-1'
      ]
    ).toEqual('>=1.0.0 <2.0.0');
  });

  it('can update root with patch change for prerelease', () => {
    const prereleaseName: string = 'alpha.1';
    const prereleaseToken: PrereleaseToken = new PrereleaseToken(prereleaseName);

    changeManager.load(path.join(__dirname, 'rootPatchChange'), prereleaseToken);
    changeManager.apply(false);

    expect(changeManager.allPackages.get('a')!.packageJson.version).toEqual('1.0.1-' + prereleaseName);
    expect(changeManager.allPackages.get('b')!.packageJson.version).toEqual('1.0.1-' + prereleaseName);
    expect(changeManager.allPackages.get('b')!.packageJson.dependencies!['a']).toEqual(
      '1.0.1-' + prereleaseName
    );
    expect(changeManager.allPackages.get('c')!.packageJson.version).toEqual('1.0.1-' + prereleaseName);
    expect(changeManager.allPackages.get('d')!.packageJson.version).toEqual('1.0.1-' + prereleaseName);
    expect(changeManager.allPackages.get('d')!.packageJson.dependencies!['c']).toEqual(
      '1.0.1-' + prereleaseName
    );
  });

  it('can update non-root with patch change for prerelease', () => {
    const prereleaseName: string = 'beta.1';
    const prereleaseToken: PrereleaseToken = new PrereleaseToken(prereleaseName);

    changeManager.load(path.join(__dirname, 'explicitVersionChange'), prereleaseToken);
    changeManager.apply(false);

    expect(changeManager.allPackages.get('a')!.packageJson.version).toEqual('1.0.0');
    expect(changeManager.allPackages.get('b')!.packageJson.version).toEqual('1.0.0');
    expect(changeManager.allPackages.get('b')!.packageJson.dependencies!['a']).toEqual('>=1.0.0 <2.0.0');
    expect(changeManager.allPackages.get('c')!.packageJson.version).toEqual('1.0.1-' + prereleaseName);
    expect(changeManager.allPackages.get('d')!.packageJson.version).toEqual('1.0.1-' + prereleaseName);
    expect(changeManager.allPackages.get('d')!.packageJson.dependencies!['c']).toEqual(
      '1.0.1-' + prereleaseName
    );
  });

  it('can update cyclic dependency for non-explicit prerelease', () => {
    const prereleaseName: string = 'beta.1';
    const prereleaseToken: PrereleaseToken = new PrereleaseToken(prereleaseName);

    changeManager.load(path.join(__dirname, 'cyclicDeps'), prereleaseToken);
    changeManager.apply(false);

    expect(changeManager.allPackages.get('cyclic-dep-1')!.packageJson.version).toEqual(
      '2.0.0-' + prereleaseName
    );
    expect(changeManager.allPackages.get('cyclic-dep-1')!.packageJson.dependencies!['cyclic-dep-2']).toEqual(
      '1.0.1-' + prereleaseName
    );
    expect(changeManager.allPackages.get('cyclic-dep-2')!.packageJson.version).toEqual(
      '1.0.1-' + prereleaseName
    );
    expect(changeManager.allPackages.get('cyclic-dep-2')!.packageJson.dependencies!['cyclic-dep-1']).toEqual(
      '2.0.0-' + prereleaseName
    );
  });

  it('can update root with patch change for adding version suffix', () => {
    const suffix: string = 'dk.1';
    const prereleaseToken: PrereleaseToken = new PrereleaseToken(undefined, suffix);

    changeManager.load(path.join(__dirname, 'rootPatchChange'), prereleaseToken);
    changeManager.apply(false);

    expect(changeManager.allPackages.get('a')!.packageJson.version).toEqual('1.0.0-' + suffix);
    expect(changeManager.allPackages.get('b')!.packageJson.version).toEqual('1.0.0-' + suffix);
    expect(changeManager.allPackages.get('b')!.packageJson.dependencies!['a']).toEqual('1.0.0-' + suffix);
    expect(changeManager.allPackages.get('c')!.packageJson.version).toEqual('1.0.0-' + suffix);
    expect(changeManager.allPackages.get('d')!.packageJson.version).toEqual('1.0.0-' + suffix);
    expect(changeManager.allPackages.get('d')!.packageJson.dependencies!['c']).toEqual('1.0.0-' + suffix);
  });

  it('can update non-root with patch change for version suffix', () => {
    const suffix: string = 'dk.1';
    const prereleaseToken: PrereleaseToken = new PrereleaseToken(undefined, suffix);

    changeManager.load(path.join(__dirname, 'explicitVersionChange'), prereleaseToken);
    changeManager.apply(false);

    expect(changeManager.allPackages.get('a')!.packageJson.version).toEqual('1.0.0');
    expect(changeManager.allPackages.get('b')!.packageJson.version).toEqual('1.0.0');
    expect(changeManager.allPackages.get('b')!.packageJson.dependencies!['a']).toEqual('>=1.0.0 <2.0.0');
    expect(changeManager.allPackages.get('c')!.packageJson.version).toEqual('1.0.0-' + suffix);
    expect(changeManager.allPackages.get('d')!.packageJson.version).toEqual('1.0.0-' + suffix);
    expect(changeManager.allPackages.get('d')!.packageJson.dependencies!['c']).toEqual('1.0.0-' + suffix);
  });

  it('can update cyclic dependency for non-explicit suffix', () => {
    const suffix: string = 'dk.1';
    const prereleaseToken: PrereleaseToken = new PrereleaseToken(undefined, suffix);

    changeManager.load(path.join(__dirname, 'cyclicDeps'), prereleaseToken);
    changeManager.apply(false);

    expect(changeManager.allPackages.get('cyclic-dep-1')!.packageJson.version).toEqual('1.0.0-' + suffix);
    expect(changeManager.allPackages.get('cyclic-dep-1')!.packageJson.dependencies!['cyclic-dep-2']).toEqual(
      '1.0.0-' + suffix
    );
    expect(changeManager.allPackages.get('cyclic-dep-2')!.packageJson.version).toEqual('1.0.0-' + suffix);
    expect(changeManager.allPackages.get('cyclic-dep-2')!.packageJson.dependencies!['cyclic-dep-1']).toEqual(
      '1.0.0-' + suffix
    );
  });
  /* eslint-enable dot-notation */
});

describe('WorkspaceChangeManager', () => {
  const rushJsonFile: string = path.resolve(__dirname, 'workspacePackages', 'rush.json');
  let rushConfiguration: RushConfiguration;
  let changeManager: ChangeManager;

  beforeEach(() => {
    rushConfiguration = RushConfiguration.loadFromConfigurationFile(rushJsonFile);
    changeManager = new ChangeManager(rushConfiguration);
  });

  /* eslint-disable dot-notation */
  it('can apply changes to the package.json files in the dictionary', () => {
    changeManager.load(path.join(__dirname, 'multipleChanges'));
    changeManager.apply(false);

    expect(changeManager.allPackages.get('a')!.packageJson.version).toEqual('2.0.0');
    expect(changeManager.allPackages.get('b')!.packageJson.version).toEqual('1.0.1');
    expect(changeManager.allPackages.get('b')!.packageJson.dependencies!['a']).toEqual(
      'workspace:>=2.0.0 <3.0.0'
    );
    expect(changeManager.allPackages.get('e')!.packageJson.devDependencies!['a']).toEqual(
      'workspace:>=2.0.0 <3.0.0'
    );
    expect(changeManager.allPackages.get('e')!.packageJson.peerDependencies!['a']).toEqual('>=2.0.0 <3.0.0');
    expect(changeManager.allPackages.get('c')!.packageJson.version).toEqual('1.0.0');
    expect(changeManager.allPackages.get('c')!.packageJson.dependencies!['b']).toEqual(
      'workspace:>=1.0.1 <2.0.0'
    );
    expect(changeManager.allPackages.get('f')!.packageJson.devDependencies!['b']).toEqual(
      'workspace:>=1.0.1 <2.0.0'
    );
    expect(changeManager.allPackages.get('f')!.packageJson.peerDependencies!['b']).toEqual('>=1.0.1 <2.0.0');
  });

  it('can update explicit version dependency', () => {
    changeManager.load(path.join(__dirname, 'explicitVersionChange'));
    changeManager.apply(false);

    expect(changeManager.allPackages.get('c')!.packageJson.version).toEqual('1.0.1');
    expect(changeManager.allPackages.get('d')!.packageJson.version).toEqual('1.0.1');
    expect(changeManager.allPackages.get('d')!.packageJson.dependencies!['c']).toEqual('workspace:1.0.1');
  });

  it('can update explicit cyclic dependency', () => {
    changeManager.load(path.join(__dirname, 'cyclicDepsExplicit'));
    changeManager.apply(false);

    expect(changeManager.allPackages.get('cyclic-dep-explicit-1')!.packageJson.version).toEqual('2.0.0');
    expect(
      changeManager.allPackages.get('cyclic-dep-explicit-1')!.packageJson.dependencies![
        'cyclic-dep-explicit-2'
      ]
    ).toEqual('workspace:>=1.0.0 <2.0.0');
    expect(changeManager.allPackages.get('cyclic-dep-explicit-2')!.packageJson.version).toEqual('1.0.0');
    expect(
      changeManager.allPackages.get('cyclic-dep-explicit-2')!.packageJson.dependencies![
        'cyclic-dep-explicit-1'
      ]
    ).toEqual('>=1.0.0 <2.0.0');
  });

  it('can update root with patch change for prerelease', () => {
    const prereleaseName: string = 'alpha.1';
    const prereleaseToken: PrereleaseToken = new PrereleaseToken(prereleaseName);

    changeManager.load(path.join(__dirname, 'rootPatchChange'), prereleaseToken);
    changeManager.apply(false);

    expect(changeManager.allPackages.get('a')!.packageJson.version).toEqual('1.0.1-' + prereleaseName);
    expect(changeManager.allPackages.get('b')!.packageJson.version).toEqual('1.0.1-' + prereleaseName);
    expect(changeManager.allPackages.get('b')!.packageJson.dependencies!['a']).toEqual(
      'workspace:1.0.1-' + prereleaseName
    );
    expect(changeManager.allPackages.get('c')!.packageJson.version).toEqual('1.0.1-' + prereleaseName);
    expect(changeManager.allPackages.get('d')!.packageJson.version).toEqual('1.0.1-' + prereleaseName);
    expect(changeManager.allPackages.get('d')!.packageJson.dependencies!['c']).toEqual(
      'workspace:1.0.1-' + prereleaseName
    );
  });

  it('can update non-root with patch change for prerelease', () => {
    const prereleaseName: string = 'beta.1';
    const prereleaseToken: PrereleaseToken = new PrereleaseToken(prereleaseName);

    changeManager.load(path.join(__dirname, 'explicitVersionChange'), prereleaseToken);
    changeManager.apply(false);

    expect(changeManager.allPackages.get('a')!.packageJson.version).toEqual('1.0.0');
    expect(changeManager.allPackages.get('b')!.packageJson.version).toEqual('1.0.0');
    expect(changeManager.allPackages.get('b')!.packageJson.dependencies!['a']).toEqual(
      'workspace:>=1.0.0 <2.0.0'
    );
    expect(changeManager.allPackages.get('c')!.packageJson.version).toEqual('1.0.1-' + prereleaseName);
    expect(changeManager.allPackages.get('d')!.packageJson.version).toEqual('1.0.1-' + prereleaseName);
    expect(changeManager.allPackages.get('d')!.packageJson.dependencies!['c']).toEqual(
      'workspace:1.0.1-' + prereleaseName
    );
  });

  it('can update cyclic dependency for non-explicit prerelease', () => {
    const prereleaseName: string = 'beta.1';
    const prereleaseToken: PrereleaseToken = new PrereleaseToken(prereleaseName);

    changeManager.load(path.join(__dirname, 'cyclicDeps'), prereleaseToken);
    changeManager.apply(false);

    expect(changeManager.allPackages.get('cyclic-dep-1')!.packageJson.version).toEqual(
      '2.0.0-' + prereleaseName
    );
    expect(changeManager.allPackages.get('cyclic-dep-1')!.packageJson.dependencies!['cyclic-dep-2']).toEqual(
      'workspace:1.0.1-' + prereleaseName
    );
    expect(changeManager.allPackages.get('cyclic-dep-2')!.packageJson.version).toEqual(
      '1.0.1-' + prereleaseName
    );
    expect(changeManager.allPackages.get('cyclic-dep-2')!.packageJson.dependencies!['cyclic-dep-1']).toEqual(
      'workspace:2.0.0-' + prereleaseName
    );
  });

  it('can update root with patch change for adding version suffix', () => {
    const suffix: string = 'dk.1';
    const prereleaseToken: PrereleaseToken = new PrereleaseToken(undefined, suffix);

    changeManager.load(path.join(__dirname, 'rootPatchChange'), prereleaseToken);
    changeManager.apply(false);

    expect(changeManager.allPackages.get('a')!.packageJson.version).toEqual('1.0.0-' + suffix);
    expect(changeManager.allPackages.get('b')!.packageJson.version).toEqual('1.0.0-' + suffix);
    expect(changeManager.allPackages.get('b')!.packageJson.dependencies!['a']).toEqual(
      'workspace:1.0.0-' + suffix
    );
    expect(changeManager.allPackages.get('c')!.packageJson.version).toEqual('1.0.0-' + suffix);
    expect(changeManager.allPackages.get('d')!.packageJson.version).toEqual('1.0.0-' + suffix);
    expect(changeManager.allPackages.get('d')!.packageJson.dependencies!['c']).toEqual(
      'workspace:1.0.0-' + suffix
    );
  });

  it('can update non-root with patch change for version suffix', () => {
    const suffix: string = 'dk.1';
    const prereleaseToken: PrereleaseToken = new PrereleaseToken(undefined, suffix);

    changeManager.load(path.join(__dirname, 'explicitVersionChange'), prereleaseToken);
    changeManager.apply(false);

    expect(changeManager.allPackages.get('a')!.packageJson.version).toEqual('1.0.0');
    expect(changeManager.allPackages.get('b')!.packageJson.version).toEqual('1.0.0');
    expect(changeManager.allPackages.get('b')!.packageJson.dependencies!['a']).toEqual(
      'workspace:>=1.0.0 <2.0.0'
    );
    expect(changeManager.allPackages.get('c')!.packageJson.version).toEqual('1.0.0-' + suffix);
    expect(changeManager.allPackages.get('d')!.packageJson.version).toEqual('1.0.0-' + suffix);
    expect(changeManager.allPackages.get('d')!.packageJson.dependencies!['c']).toEqual(
      'workspace:1.0.0-' + suffix
    );
  });

  it('can update cyclic dependency for non-explicit suffix', () => {
    const suffix: string = 'dk.1';
    const prereleaseToken: PrereleaseToken = new PrereleaseToken(undefined, suffix);

    changeManager.load(path.join(__dirname, 'cyclicDeps'), prereleaseToken);
    changeManager.apply(false);

    expect(changeManager.allPackages.get('cyclic-dep-1')!.packageJson.version).toEqual('1.0.0-' + suffix);
    expect(changeManager.allPackages.get('cyclic-dep-1')!.packageJson.dependencies!['cyclic-dep-2']).toEqual(
      'workspace:1.0.0-' + suffix
    );
    expect(changeManager.allPackages.get('cyclic-dep-2')!.packageJson.version).toEqual('1.0.0-' + suffix);
    expect(changeManager.allPackages.get('cyclic-dep-2')!.packageJson.dependencies!['cyclic-dep-1']).toEqual(
      'workspace:1.0.0-' + suffix
    );
  });
  /* eslint-enable dot-notation */
});
