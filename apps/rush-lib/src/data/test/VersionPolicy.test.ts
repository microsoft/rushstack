// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/// <reference types='mocha' />

import * as path from 'path';
import { assert } from 'chai';
import { IPackageJson } from '@microsoft/node-core-library';

import { VersionPolicyConfiguration } from '../VersionPolicyConfiguration';
import {
  VersionPolicy,
  LockStepVersionPolicy,
  IndividualVersionPolicy,
  BumpType
} from '../VersionPolicy';

describe('VersionPolicy', () => {
  describe('LockStepVersion', () => {
    const filename: string = path.resolve(__dirname, 'jsonFiles', 'rushWithLockVersion.json');
    const versionPolicyConfig: VersionPolicyConfiguration = new VersionPolicyConfiguration(filename);
    const versionPolicy: VersionPolicy = versionPolicyConfig.getVersionPolicy('testPolicy1');

    it('loads configuration.', () => {
      assert.isTrue(versionPolicy instanceof LockStepVersionPolicy, 'versionPolicy is a LockStepVersionPolicy');
      const lockStepVersionPolicy: LockStepVersionPolicy = versionPolicy as LockStepVersionPolicy;
      assert.equal(lockStepVersionPolicy.version.format(), '1.1.0');
      assert.equal(lockStepVersionPolicy.nextBump, BumpType.patch);
    });

    it('skips packageJson if version is already the locked step version', () => {
      const lockStepVersionPolicy: LockStepVersionPolicy = versionPolicy as LockStepVersionPolicy;
      assert.isUndefined(lockStepVersionPolicy.ensure({
        name: 'a',
        version: '1.1.0'
      }), 'PackageJson does not get changed and is not returned.');
    });

    it('updates packageJson if version is lower than the locked step version', () => {
      const lockStepVersionPolicy: LockStepVersionPolicy = versionPolicy as LockStepVersionPolicy;
      const expectedPackageJson: IPackageJson = {
        name: 'a',
        version: '1.1.0'
      };
      const originalPackageJson: IPackageJson = {
        name: 'a',
        version: '1.0.1'
      };
      assert.deepEqual(lockStepVersionPolicy.ensure(originalPackageJson), expectedPackageJson);
    });

    it('throws exception if version is higher than the locked step version', () => {
      const lockStepVersionPolicy: LockStepVersionPolicy = versionPolicy as LockStepVersionPolicy;
      const originalPackageJson: IPackageJson = {
        name: 'a',
        version: '2.1.0'
      };
      assert.throw(() => {
        lockStepVersionPolicy.ensure(originalPackageJson);
      });
    });

    it('bumps version for preminor release', () => {
      const lockStepVersionPolicy: LockStepVersionPolicy = versionPolicy as LockStepVersionPolicy;
      lockStepVersionPolicy.bump(BumpType.preminor, 'pr');
      assert.equal(lockStepVersionPolicy.version.format(), '1.2.0-pr.0');
      assert.equal(lockStepVersionPolicy.nextBump, BumpType.patch);
    });

    it('bumps version for minor release', () => {
      const lockStepVersionPolicy: LockStepVersionPolicy = versionPolicy as LockStepVersionPolicy;
      lockStepVersionPolicy.bump(BumpType.minor);
      assert.equal(lockStepVersionPolicy.version.format(), '1.2.0');
      assert.equal(lockStepVersionPolicy.nextBump, BumpType.patch);
    });
  });

  describe('IndividualVersionPolicy', () => {
    const fileName: string = path.resolve(__dirname, 'jsonFiles', 'rushWithIndividualVersion.json');
    const versionPolicyConfig: VersionPolicyConfiguration = new VersionPolicyConfiguration(fileName);
    const versionPolicy: VersionPolicy = versionPolicyConfig.getVersionPolicy('testPolicy2');

    it('loads configuration', () => {
      assert.isTrue(versionPolicy instanceof IndividualVersionPolicy, 'versionPolicy is a IndividualVersionPolicy');
      const individualVersionPolicy: IndividualVersionPolicy = versionPolicy as IndividualVersionPolicy;
      assert.equal(individualVersionPolicy.lockedMajor, 2);
    });

    it('skips packageJson if no need to change', () => {
      const individualVersionPolicy: IndividualVersionPolicy = versionPolicy as IndividualVersionPolicy;
      assert.isUndefined(individualVersionPolicy.ensure({
        name: 'a',
        version: '2.1.0'
      }), 'PackageJson does not get changed and is not returned.');
    });

    it('updates packageJson if version is lower than the locked major', () => {
      const individualVersionPolicy: IndividualVersionPolicy = versionPolicy as IndividualVersionPolicy;
      const expectedPackageJson: IPackageJson = {
        name: 'a',
        version: '2.0.0'
      };
      const originalPackageJson: IPackageJson = {
        name: 'a',
        version: '1.0.1'
      };
      assert.deepEqual(individualVersionPolicy.ensure(originalPackageJson), expectedPackageJson);
    });

    it('throws exception if version is higher than the locked step version', () => {
      const individualVersionPolicy: IndividualVersionPolicy = versionPolicy as IndividualVersionPolicy;
      const originalPackageJson: IPackageJson = {
        name: 'a',
        version: '3.1.0'
      };
      assert.throw(() => {
        individualVersionPolicy.ensure(originalPackageJson);
      });
    });
  });
});