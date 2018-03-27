// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// <reference types='mocha' />

import { assert } from 'chai';
import {
  EnvironmentConfiguration,
  EnvironmentValue
} from '../EnvironmentConfiguration';

describe('EnvironmentConfiguration', () => {
  let _oldEnv: typeof process.env;

  beforeEach(() => {
    EnvironmentConfiguration.reset();
    _oldEnv = process.env;
    process.env = {};
  });

  afterEach(() => {
    process.env = _oldEnv;
  });

  describe('initialize', () => {
    it('correctly allows no environment variables', () => {
      assert.doesNotThrow(EnvironmentConfiguration.initialize);
    });

    it('allows known environment variables', () => {
      process.env['rush_tempDir'] = '/var/temp'; // tslint:disable-line:no-string-literal
      assert.doesNotThrow(EnvironmentConfiguration.initialize);
    });

    it('does not allow unknown environment variables', () => {
      process.env['rush_foobar'] = 'asdf'; // tslint:disable-line:no-string-literal
      assert.throws(EnvironmentConfiguration.initialize);
    });

    it('can be re-initialized', () => {
      process.env['rush_tempDir'] = '/var/tempA'; // tslint:disable-line:no-string-literal
      EnvironmentConfiguration.initialize();

      assert.equal(EnvironmentConfiguration.getEnvironmentValue(EnvironmentValue.TempDirectoryOverride), '/var/tempA');

      process.env['rush_tempDir'] = '/var/tempB'; // tslint:disable-line:no-string-literal
      EnvironmentConfiguration.initialize();

      assert.equal(EnvironmentConfiguration.getEnvironmentValue(EnvironmentValue.TempDirectoryOverride), '/var/tempB');
    });
  });

  describe('getEnvironmentValue', () => {
    it('throws if EnvironmentConfiguration is not initialized', () => {
      assert.throws(() => EnvironmentConfiguration.getEnvironmentValue(EnvironmentValue.TempDirectoryOverride));
    });

    it('returns undefined for unset environment variables', () => {
      EnvironmentConfiguration.initialize();

      assert.isUndefined(EnvironmentConfiguration.getEnvironmentValue(EnvironmentValue.TempDirectoryOverride));
    });

    it('returns the value for a set environment variable', () => {
      const expectedValue: string = '/var/temp';
      process.env['rush_tempDir'] = expectedValue; // tslint:disable-line:no-string-literal
      EnvironmentConfiguration.initialize();

      assert.equal(EnvironmentConfiguration.getEnvironmentValue(EnvironmentValue.TempDirectoryOverride), expectedValue);
    });
  });
});
