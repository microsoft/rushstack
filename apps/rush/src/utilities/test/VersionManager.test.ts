// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { assert } from 'chai';
import * as path from 'path';

import {
  RushConfiguration,
  IPackageJson
} from '@microsoft/rush-lib';

import { VersionManager } from '../VersionManager';

describe('VersionManager', () => {
  const rushJsonFile: string = path.resolve(__dirname, 'repo', 'rush.json');
  const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(rushJsonFile);
  let versionManager: VersionManager;

  beforeEach(() => {
    versionManager = new VersionManager(rushConfiguration);
  });

  /* tslint:disable:no-string-literal */
  describe('ensure', () => {
    it('ensures lock step version', () => {
      const updatedPackages: Map<string, IPackageJson> = versionManager.ensure('testPolicy1');
      const expectedVersion: string = '10.10.0';
      assert.equal(updatedPackages.size, 2);
      assert.equal(updatedPackages.get('a').version, expectedVersion);
      assert.equal(updatedPackages.get('b').version, expectedVersion);
      assert.equal(updatedPackages.get('b').dependencies['a'], `~${expectedVersion}`);
      assert.equal(updatedPackages.get('c').version, '3.0.0', 'c version should not change');
      assert.equal(updatedPackages.get('c').dependencies['b'], `>=10.10.0 <11.0.0`);
    });
  });
  /* tslint:enable:no-string-literal */
});