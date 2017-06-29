// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/// <reference types='mocha' />

import * as path from 'path';
import { assert } from 'chai';
import RushConfiguration from '../RushConfiguration';

import {
  VersionPolicy,
  LockStepVersionPolicy,
  IndividualVersionPolicy,
  BumpType
} from '../VersionPolicy';

describe('VersionPolicy', () => {
  it('can load lockStepVersion.', () => {
    const rushFilename: string = path.resolve(__dirname, 'jsonFiles', 'rushWithLockVersion.json');
    const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(rushFilename);
    const versionPolicy: VersionPolicy = rushConfiguration.getVersionPolicy('testPolicy1');
    assert.isTrue(versionPolicy instanceof LockStepVersionPolicy, 'versionPolicy is a LockStepVersionPolicy');
    const lockStepVersionPolicy: LockStepVersionPolicy = versionPolicy as LockStepVersionPolicy;
    assert.equal(lockStepVersionPolicy.version, '1.1.0');
    assert.equal(lockStepVersionPolicy.nextBump, BumpType.patch);
  });

  it('can load lockStepVersion.', () => {
    const rushFilename: string = path.resolve(__dirname, 'jsonFiles', 'rushWithIndividualVersion.json');
    const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(rushFilename);
    const versionPolicy: VersionPolicy = rushConfiguration.getVersionPolicy('testPolicy2');
    assert.isTrue(versionPolicy instanceof IndividualVersionPolicy, 'versionPolicy is a IndividualVersionPolicy');
    const individualVersionPolicy: IndividualVersionPolicy = versionPolicy as IndividualVersionPolicy;
    assert.equal(individualVersionPolicy.lockedMajor, 2);
  });
});