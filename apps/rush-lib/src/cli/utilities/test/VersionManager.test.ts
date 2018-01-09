// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { assert } from 'chai';
import * as path from 'path';

import { BumpType } from '../../../data/VersionPolicy';
import { ChangeFile } from '../../../data/ChangeFile';
import { ChangeType, IChangeInfo } from '../../../data/ChangeManagement';
import RushConfiguration from '../../../data/RushConfiguration';
import IPackageJson from '../../../utilities/IPackageJson';
import { VersionManager } from '../VersionManager';

function _getChanges(changeFiles: Map<string, ChangeFile>,
  packageName: string): IChangeInfo[] | undefined {
  const changeFile: ChangeFile | undefined = changeFiles.get(packageName);
  if (!changeFile) {
    return undefined;
  }
  return changeFile.getChanges(packageName);
}

describe('VersionManager', () => {
  const rushJsonFile: string = path.resolve(__dirname, 'repo', 'rush.json');
  const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(rushJsonFile);
  let versionManager: VersionManager;

  beforeEach(() => {
    versionManager = new VersionManager(rushConfiguration, 'test@microsoft.com',
      rushConfiguration.versionPolicyConfiguration);
  });

  /* tslint:disable:no-string-literal */
  describe('ensure', () => {
    it('fixes lock step versions', () => {
      versionManager.ensure('testPolicy1');
      const updatedPackages: Map<string, IPackageJson> = versionManager.updatedProjects;
      const expectedVersion: string = '10.10.0';
      assert.equal(updatedPackages.size, 6, 'The number of updated packages matches');
      assert.equal(updatedPackages.get('a')!.version, expectedVersion);
      assert.equal(updatedPackages.get('b')!.version, expectedVersion);
      assert.equal(updatedPackages.get('b')!.dependencies!['a'], `~${expectedVersion}`);
      assert.equal(updatedPackages.get('c')!.version, '3.1.1', 'c version should not change');
      assert.equal(updatedPackages.get('c')!.dependencies!['b'], `>=10.10.0 <11.0.0`);
      assert.equal(updatedPackages.get('d')!.version, '4.1.1', 'd version should not change');
      assert.equal(updatedPackages.get('d')!.dependencies!['b'], `>=10.10.0 <11.0.0`);
      assert.equal(updatedPackages.get('f')!.version, '1.0.0', 'f version should not change');
      assert.equal(updatedPackages.get('f')!.dependencies!['a'], `~10.10.0`);
      assert.equal(updatedPackages.get('g')!.devDependencies!['a'], `~10.10.0`);

      const changeFiles: Map<string, ChangeFile> = versionManager.changeFiles;
      assert.equal(changeFiles.size, 4, 'The number of change files matches');
       assert.equal(_getChanges(changeFiles, 'a')!.length, 1, 'a does not have one change');
       assert.equal(_getChanges(changeFiles, 'a')![0].changeType, ChangeType.none,
         'a does not have a none change');
       assert.equal(_getChanges(changeFiles, 'b')!.length, 1, 'b does not have one change');
       assert.equal(_getChanges(changeFiles, 'b')![0].changeType, ChangeType.none,
         'b does not have a none change');
      assert.equal(_getChanges(changeFiles, 'c')!.length, 2, 'c does not have two change');
      assert.equal(_getChanges(changeFiles, 'c')![0].changeType, ChangeType.patch,
        'c does not have a patch change');
      assert.equal(_getChanges(changeFiles, 'c')![1].changeType, ChangeType.dependency,
        'c does not have a dependency change');
      assert.equal(_getChanges(changeFiles, 'd')!.length, 2, 'd does not have two change');
      assert.equal(_getChanges(changeFiles, 'd')![0].changeType, ChangeType.patch,
        'd does not have a  patch change');
      assert.equal(_getChanges(changeFiles, 'd')![1].changeType, ChangeType.dependency,
        'd does not have a  patch change');
    });

    it('fixes major version for individual version policy', () => {
      versionManager.ensure('testPolicy2');
      const updatedPackages: Map<string, IPackageJson> = versionManager.updatedProjects;
      assert.equal(updatedPackages.size, 2);
      assert.equal(updatedPackages.get('c')!.version, '5.0.0');
      assert.equal(updatedPackages.get('c')!.dependencies!['b'], `>=2.0.0 <3.0.0`);
      assert.equal(updatedPackages.get('e')!.version, '10.10.0');
      assert.equal(updatedPackages.get('e')!.dependencies!['c'], '~5.0.0');
    });

    it('does not change packageJson if not needed by individual version policy', () => {
      versionManager.ensure('testPolicy3');
      const updatedPackages: Map<string, IPackageJson> = versionManager.updatedProjects;
      assert.equal(updatedPackages.size, 0);
    });
  });

  describe('bump', () => {
    it('bumps to prerelease version', () => {
      versionManager.bump('testPolicy1', BumpType.prerelease, 'dev', false);
      const updatedPackages: Map<string, IPackageJson> = versionManager.updatedProjects;
      const expectedVersion: string = '10.10.1-dev.0';

      const changeFiles: Map<string, ChangeFile> = versionManager.changeFiles;

      assert.equal(updatedPackages.get('a')!.version, expectedVersion, `a version is not expected`);
      assert.equal(updatedPackages.get('b')!.version, expectedVersion, `b version is not expected`);
      assert.equal(updatedPackages.get('e')!.version, expectedVersion, `e version is not expected`);
      assert.equal(updatedPackages.get('g')!.devDependencies!['a'], `~${expectedVersion}`,
        'a version is not expected in dev dependency');
      assert.isUndefined(_getChanges(changeFiles, 'a'), 'a has change entry.');
      assert.isUndefined(_getChanges(changeFiles, 'b'), 'b has change entry');
    });
  });
  /* tslint:enable:no-string-literal */
});