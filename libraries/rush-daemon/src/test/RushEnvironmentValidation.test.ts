// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { validateRequestRushEnvironment } from '../RushEnvironmentValidation';

describe(validateRequestRushEnvironment.name, () => {
  it('accepts valid and unrelated values', () => {
    expect(() =>
      validateRequestRushEnvironment({
        PATH: '/usr/bin',
        RUSH_ALLOW_WARNINGS_IN_SUCCESSFUL_BUILD: '1',
        RUSH_BUILD_CACHE_ENABLED: '0',
        RUSH_QUIET_MODE: 'true',
        RUSH_ALLOW_UNSUPPORTED_NODEJS: 'false',
        RUSH_ABSOLUTE_SYMLINKS: '',
        RUSH_PARALLELISM: 'max'
      })
    ).not.toThrow();
  });

  it('rejects an invalid boolean with the native message', () => {
    expect(() =>
      validateRequestRushEnvironment({ RUSH_ALLOW_WARNINGS_IN_SUCCESSFUL_BUILD: 'yes' })
    ).toThrow(
      'Invalid value "yes" for the environment variable RUSH_ALLOW_WARNINGS_IN_SUCCESSFUL_BUILD. Valid choices are 0 or 1.'
    );
  });

  it('rejects unknown RUSH_ variables', () => {
    expect(() => validateRequestRushEnvironment({ RUSH_NOT_A_SETTING: '1' })).toThrow(
      'not recognized by this version of Rush: RUSH_NOT_A_SETTING'
    );
  });

  it('rejects invalid daemon settings before a restart is planned', () => {
    expect(() => validateRequestRushEnvironment({ RUSH_DAEMON_AUTO_START: 'yes' })).toThrow(
      'RUSH_DAEMON_AUTO_START must be 0 or 1.'
    );
    expect(() => validateRequestRushEnvironment({ RUSH_DAEMON_AUTO_START: '1' })).not.toThrow();
  });

  it('rejects mutually exclusive build cache overrides', () => {
    expect(() =>
      validateRequestRushEnvironment({
        RUSH_BUILD_CACHE_OVERRIDE_JSON: '{}',
        RUSH_BUILD_CACHE_OVERRIDE_JSON_FILE_PATH: 'cache.json'
      })
    ).toThrow('are mutually exclusive');
  });
});