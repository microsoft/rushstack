// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// <reference types='mocha' />

import { assert } from 'chai';
import { EnvironmentConfiguration } from '../EnvironmentConfiguration';

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
      process.env['RUSH_TEMP_FOLDER'] = '/var/temp'; // tslint:disable-line:no-string-literal
      assert.doesNotThrow(EnvironmentConfiguration.initialize);
    });

    it('does not allow unknown environment variables', () => {
      process.env['rush_foobar'] = 'asdf'; // tslint:disable-line:no-string-literal
      assert.throws(EnvironmentConfiguration.initialize);
    });

    it('can be re-initialized', () => {
      process.env['RUSH_TEMP_FOLDER'] = '/var/tempA'; // tslint:disable-line:no-string-literal
      EnvironmentConfiguration.initialize();

      assert.equal(EnvironmentConfiguration.rushTempFolderOverride, '/var/tempA');

      process.env['RUSH_TEMP_FOLDER'] = '/var/tempB'; // tslint:disable-line:no-string-literal
      EnvironmentConfiguration.initialize();

      assert.equal(EnvironmentConfiguration.rushTempFolderOverride, '/var/tempB');
    });
  });

  describe('rushTempDirOverride', () => {
    it('throws if EnvironmentConfiguration is not initialized', () => {
      assert.throws(() => EnvironmentConfiguration.rushTempFolderOverride);
    });

    it('returns undefined for unset environment variables', () => {
      EnvironmentConfiguration.initialize();

      assert.isUndefined(EnvironmentConfiguration.rushTempFolderOverride);
    });

    it('returns the value for a set environment variable', () => {
      const expectedValue: string = '/var/temp';
      process.env['RUSH_TEMP_FOLDER'] = expectedValue; // tslint:disable-line:no-string-literal
      EnvironmentConfiguration.initialize();

      assert.equal(EnvironmentConfiguration.rushTempFolderOverride, expectedValue);
    });
  });
});
