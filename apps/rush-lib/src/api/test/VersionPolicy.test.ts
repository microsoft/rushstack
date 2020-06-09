// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { IPackageJson } from '@rushstack/node-core-library';

import { VersionPolicyConfiguration } from '../VersionPolicyConfiguration';
import { VersionPolicy, LockStepVersionPolicy, IndividualVersionPolicy, BumpType } from '../VersionPolicy';

describe('VersionPolicy', () => {
  describe('LockStepVersion', () => {
    const filename: string = path.resolve(__dirname, 'jsonFiles', 'rushWithLockVersion.json');
    const versionPolicyConfig: VersionPolicyConfiguration = new VersionPolicyConfiguration(filename);
    let versionPolicy: VersionPolicy;

    beforeEach(() => {
      versionPolicy = versionPolicyConfig.getVersionPolicy('testPolicy1');
    });

    it('loads configuration.', () => {
      expect(versionPolicy).toBeInstanceOf(LockStepVersionPolicy);
      const lockStepVersionPolicy: LockStepVersionPolicy = versionPolicy as LockStepVersionPolicy;
      expect(lockStepVersionPolicy.version).toEqual('1.1.0');
      expect(lockStepVersionPolicy.nextBump).toEqual(BumpType.patch);
    });

    it('skips packageJson if version is already the locked step version', () => {
      const lockStepVersionPolicy: LockStepVersionPolicy = versionPolicy as LockStepVersionPolicy;
      expect(
        lockStepVersionPolicy.ensure({
          name: 'a',
          version: '1.1.0'
        })
      ).not.toBeDefined();
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
      expect(lockStepVersionPolicy.ensure(originalPackageJson)).toEqual(expectedPackageJson);
    });

    it('throws exception if version is higher than the locked step version', () => {
      const lockStepVersionPolicy: LockStepVersionPolicy = versionPolicy as LockStepVersionPolicy;
      const originalPackageJson: IPackageJson = {
        name: 'a',
        version: '2.1.0'
      };
      expect(() => {
        lockStepVersionPolicy.ensure(originalPackageJson);
      }).toThrow();
    });

    it('update version with force if version is higher than the locked step version', () => {
      const lockStepVersionPolicy: LockStepVersionPolicy = versionPolicy as LockStepVersionPolicy;
      const originalPackageJson: IPackageJson = {
        name: 'a',
        version: '2.1.0'
      };
      const expectedPackageJson: IPackageJson = {
        name: 'a',
        version: '1.1.0'
      };
      expect(lockStepVersionPolicy.ensure(originalPackageJson, true)).toEqual(expectedPackageJson);
    });

    it('bumps version for preminor release', () => {
      const lockStepVersionPolicy: LockStepVersionPolicy = versionPolicy as LockStepVersionPolicy;
      lockStepVersionPolicy.bump(BumpType.preminor, 'pr');
      expect(lockStepVersionPolicy.version).toEqual('1.2.0-pr.0');
      expect(lockStepVersionPolicy.nextBump).toEqual(BumpType.patch);
    });

    it('bumps version for minor release', () => {
      const lockStepVersionPolicy: LockStepVersionPolicy = versionPolicy as LockStepVersionPolicy;
      lockStepVersionPolicy.bump(BumpType.minor);
      expect(lockStepVersionPolicy.version).toEqual('1.2.0');
      expect(lockStepVersionPolicy.nextBump).toEqual(BumpType.patch);
    });

    it('can update version directly', () => {
      const lockStepVersionPolicy: LockStepVersionPolicy = versionPolicy as LockStepVersionPolicy;
      const newVersion: string = '1.5.6-beta.0';
      lockStepVersionPolicy.update(newVersion);
      expect(lockStepVersionPolicy.version).toEqual(newVersion);
    });
  });

  describe('IndividualVersionPolicy', () => {
    const fileName: string = path.resolve(__dirname, 'jsonFiles', 'rushWithIndividualVersion.json');
    const versionPolicyConfig: VersionPolicyConfiguration = new VersionPolicyConfiguration(fileName);
    const versionPolicy: VersionPolicy = versionPolicyConfig.getVersionPolicy('testPolicy2');

    it('loads configuration', () => {
      expect(versionPolicy).toBeInstanceOf(IndividualVersionPolicy);
      const individualVersionPolicy: IndividualVersionPolicy = versionPolicy as IndividualVersionPolicy;
      expect(individualVersionPolicy.lockedMajor).toEqual(2);
    });

    it('skips packageJson if no need to change', () => {
      const individualVersionPolicy: IndividualVersionPolicy = versionPolicy as IndividualVersionPolicy;
      expect(
        individualVersionPolicy.ensure({
          name: 'a',
          version: '2.1.0'
        })
      ).not.toBeDefined();
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
      expect(individualVersionPolicy.ensure(originalPackageJson)).toEqual(expectedPackageJson);
    });

    it('throws exception if version is higher than the locked step version', () => {
      const individualVersionPolicy: IndividualVersionPolicy = versionPolicy as IndividualVersionPolicy;
      const originalPackageJson: IPackageJson = {
        name: 'a',
        version: '3.1.0'
      };
      expect(() => {
        individualVersionPolicy.ensure(originalPackageJson);
      }).toThrow();
    });
  });
});
