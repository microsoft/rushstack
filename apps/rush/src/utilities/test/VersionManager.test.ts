// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { assert } from 'chai';
import * as path from 'path';

import {
  ChangeFile,
  ChangeType,
  RushConfiguration,
  VersionPolicyConfiguration,
  IPackageJson
} from '@microsoft/rush-lib';

import { VersionManager } from '../VersionManager';

describe('VersionManager', () => {
  const rushJsonFile: string = path.resolve(__dirname, 'repo', 'rush.json');
  const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(rushJsonFile);
  const versionConfigJsonFile: string = path.resolve(__dirname, 'repo', 'version-policies.json');
  const versionPolicyConfiguration: VersionPolicyConfiguration =
    new VersionPolicyConfiguration(versionConfigJsonFile);
  let versionManager: VersionManager;

  beforeEach(() => {
    versionManager = new VersionManager(rushConfiguration, versionPolicyConfiguration);
  });

  /* tslint:disable:no-string-literal */
  describe('ensure', () => {
    it('fixes lock step versions', () => {
      versionManager.ensure('testPolicy1');
      const updatedPackages: Map<string, IPackageJson> = versionManager.updatedProjects;
      const expectedVersion: string = '10.10.0';
      assert.equal(updatedPackages.size, 5, 'The number of updated packages matches');
      assert.equal(updatedPackages.get('a').version, expectedVersion);
      assert.equal(updatedPackages.get('b').version, expectedVersion);
      assert.equal(updatedPackages.get('b').dependencies['a'], `~${expectedVersion}`);
      assert.equal(updatedPackages.get('c').version, '3.1.1', 'c version should not change');
      assert.equal(updatedPackages.get('c').dependencies['b'], `>=10.10.0 <11.0.0`);
      assert.equal(updatedPackages.get('d').version, '4.1.1', 'd version should not change');
      assert.equal(updatedPackages.get('d').dependencies['b'], `>=10.10.0 <11.0.0`);
      assert.equal(updatedPackages.get('f').version, '1.0.0', 'f version should not change');
      assert.equal(updatedPackages.get('f').dependencies['a'], `~10.10.0`);

      const changeFiles: Map<string, ChangeFile> = versionManager.changeFiles;
      assert.equal(changeFiles.size, 4, 'The number of change files matches');
      assert.equal(changeFiles.get('a').data.changes.length, 1, 'a does not have one change');
      assert.equal(changeFiles.get('a').data.changes[0].changeType, ChangeType.none,
        'a does not have a none change');
      assert.equal(changeFiles.get('b').data.changes.length, 3, 'b does not have three change');
      assert.equal(changeFiles.get('b').data.changes[0].changeType, ChangeType.none,
        'b does not have a none change');
      assert.equal(changeFiles.get('b').data.changes[1].changeType, ChangeType.patch,
        'b does not have a patch change');
      assert.equal(changeFiles.get('b').data.changes[2].changeType, ChangeType.dependency,
        'b does not have a dependency update');
      assert.equal(changeFiles.get('c').data.changes.length, 2, 'c does not have two change');
      assert.equal(changeFiles.get('c').data.changes[0].changeType, ChangeType.patch,
        'c does not have a patch change');
      assert.equal(changeFiles.get('c').data.changes[1].changeType, ChangeType.dependency,
        'c does not have a dependency change');
      assert.equal(changeFiles.get('d').data.changes.length, 2, 'd does not have two change');
      assert.equal(changeFiles.get('d').data.changes[0].changeType, ChangeType.patch,
        'd does not have a  patch change');
      assert.equal(changeFiles.get('d').data.changes[1].changeType, ChangeType.dependency,
        'd does not have a  patch change');
    });
  });

  describe('ensure', () => {
    it('fixes major version for individual version policy', () => {
      versionManager.ensure('testPolicy2');
      const updatedPackages: Map<string, IPackageJson> = versionManager.updatedProjects;
      assert.equal(updatedPackages.size, 2);
      assert.equal(updatedPackages.get('c').version, '5.0.0');
      assert.equal(updatedPackages.get('c').dependencies['b'], `>=2.0.0 <3.0.0`);
      assert.equal(updatedPackages.get('e').version, '10.10.0');
      assert.equal(updatedPackages.get('e').dependencies['c'], '~5.0.0');
    });
  });

  describe('ensure', () => {
    it('does not change packageJson if not needed by individual version policy', () => {
      versionManager.ensure('testPolicy3');
      const updatedPackages: Map<string, IPackageJson> = versionManager.updatedProjects;
      assert.equal(updatedPackages.size, 0);
    });
  });
  /* tslint:enable:no-string-literal */
});