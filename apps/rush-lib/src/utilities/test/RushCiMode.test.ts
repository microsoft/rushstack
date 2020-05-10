// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as isCI from 'is-ci';

import { RushCiMode } from '../RushCiMode';
import { EnvironmentConfiguration } from '../../api/EnvironmentConfiguration';

/* eslint-disable dot-notation */
const RUSH_CI_MODE_ENV_VAR: string = 'RUSH_CI_MODE';
describe('IsCI', () => {
  it('determines the current mode as CI if RUSH_CI_MODE is set to CI', (done: jest.DoneCallback) => {
    RushCiMode.initialize('CI');
    expect(RushCiMode.isCI()).toBe(true);

    RushCiMode.initialize('NON-CI');
    RushCiMode.initialize('CI');
    expect(RushCiMode.isCI()).toBe(true);

    RushCiMode.initialize('');
    RushCiMode.initialize('CI');
    expect(RushCiMode.isCI()).toBe(true);

    RushCiMode.initialize('NON-CI');
    RushCiMode.initialize(undefined);
    RushCiMode.initialize('CI');
    expect(RushCiMode.isCI()).toBe(true);

    RushCiMode.initialize('');
    RushCiMode.initialize('NON-CI');
    RushCiMode.initialize('AAA');
    RushCiMode.initialize('CI');
    expect(RushCiMode.isCI()).toBe(true);

    RushCiMode.initialize('NON-CI');
    RushCiMode.initialize('AAA');
    RushCiMode.initialize('');
    RushCiMode.initialize('CI');
    expect(RushCiMode.isCI()).toBe(true);

    RushCiMode.initialize('NON-CI');
    RushCiMode.initialize('AAA');
    process.env[RUSH_CI_MODE_ENV_VAR] = 'ABC';
    EnvironmentConfiguration.initialize();
    RushCiMode.initialize('');
    RushCiMode.initialize('CI');
    RushCiMode.initialize('CI');
    expect(RushCiMode.isCI()).toBe(true);

    process.env[RUSH_CI_MODE_ENV_VAR] = 'CI';
    EnvironmentConfiguration.initialize();
    expect(RushCiMode.isCI()).toBe(true);

    done();
  });

  it('determines the current mode as NON-CI if RUSH_CI_MODE is set to NON-CI', (done: jest.DoneCallback) => {
    RushCiMode.initialize('NON-CI');
    expect(RushCiMode.isCI()).toBe(false);

    RushCiMode.initialize('CI');
    RushCiMode.initialize('NON-CI');
    expect(RushCiMode.isCI()).toBe(false);

    RushCiMode.initialize(undefined);
    RushCiMode.initialize('NON-CI');
    expect(RushCiMode.isCI()).toBe(false);

    RushCiMode.initialize('CI');
    RushCiMode.initialize('');
    RushCiMode.initialize('NON-CI');
    RushCiMode.initialize('NON-CI');
    expect(RushCiMode.isCI()).toBe(false);

    RushCiMode.initialize('CI');
    RushCiMode.initialize('');
    RushCiMode.initialize('AAA');
    process.env[RUSH_CI_MODE_ENV_VAR] = 'CI';
    EnvironmentConfiguration.initialize();
    RushCiMode.initialize('NON-CI');
    expect(RushCiMode.isCI()).toBe(false);

    process.env['RUSH_CI_MODE'] = 'NON-CI';
    EnvironmentConfiguration.initialize();
    expect(RushCiMode.isCI()).toBe(false);

    done();
  });

  it(
    'determines the current mode as returned by the isCI package if RUSH_CI_MODE is neither set to CI nor to NON-CI',
    (done: jest.DoneCallback) => {
      RushCiMode.initialize('ABC');
      expect(RushCiMode.isCI()).toBe(isCI);

      RushCiMode.initialize('CI');
      RushCiMode.initialize(undefined);
      expect(RushCiMode.isCI()).toBe(isCI);

      RushCiMode.initialize('NON-CI');
      RushCiMode.initialize(undefined);
      expect(RushCiMode.isCI()).toBe(isCI);

      RushCiMode.initialize('NON-CI');
      RushCiMode.initialize(undefined);
      expect(RushCiMode.isCI()).toBe(isCI);

      RushCiMode.initialize('NON-CI');
      RushCiMode.initialize('CI');
      RushCiMode.initialize(undefined);
      expect(RushCiMode.isCI()).toBe(isCI);

      RushCiMode.initialize('CI');
      RushCiMode.initialize('NON-CI');
      RushCiMode.initialize('');
      expect(RushCiMode.isCI()).toBe(isCI);

      RushCiMode.initialize('CI');
      RushCiMode.initialize('NON-CI');
      RushCiMode.initialize('DEF');
      expect(RushCiMode.isCI()).toBe(isCI);

      process.env['RUSH_CI_MODE'] = '';
      EnvironmentConfiguration.initialize();
      expect(RushCiMode.isCI()).toBe(isCI);

      process.env['RUSH_CI_MODE'] = 'ABC';
      EnvironmentConfiguration.initialize();
      expect(RushCiMode.isCI()).toBe(isCI);

      process.env['RUSH_CI_MODE'] = undefined;
      EnvironmentConfiguration.initialize();
      expect(RushCiMode.isCI()).toBe(isCI);

      done();
    }
  );
});