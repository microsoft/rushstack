// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { assert } from 'chai';
import * as path from 'path';

import {
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
      const updatedPackages: Map<string, IPackageJson> = versionManager.ensure('testPolicy1');
      const expectedVersion: string = '10.10.0';
      assert.equal(updatedPackages.size, 4);
      assert.equal(updatedPackages.get('a').version, expectedVersion);
      assert.equal(updatedPackages.get('b').version, expectedVersion);
      assert.equal(updatedPackages.get('b').dependencies['a'], `~${expectedVersion}`);
      assert.equal(updatedPackages.get('c').version, '3.1.1', 'c version should not change');
      assert.equal(updatedPackages.get('c').dependencies['b'], `>=10.10.0 <11.0.0`);
      assert.equal(updatedPackages.get('d').version, '4.1.1', 'd version should not change');
      assert.equal(updatedPackages.get('d').dependencies['b'], `>=10.10.0 <11.0.0`);
    });
  });

  describe('ensure', () => {
    it('fixes major version for individual version policy', () => {
      const updatedPackages: Map<string, IPackageJson> = versionManager.ensure('testPolicy2');
      assert.equal(updatedPackages.size, 1);
      assert.equal(updatedPackages.get('c').version, '5.0.0');
      assert.equal(updatedPackages.get('c').dependencies['b'], `>=2.0.0 <3.0.0`);
    });
  });

  describe('ensure', () => {
    it('does not change packageJson if not needed by individual version policy', () => {
      const updatedPackages: Map<string, IPackageJson> = versionManager.ensure('testPolicy3');
      assert.equal(updatedPackages.size, 0);
    });
  });
  /* tslint:enable:no-string-literal */
});