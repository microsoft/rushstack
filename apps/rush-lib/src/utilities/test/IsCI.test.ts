// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as process from 'process';
import * as isCI from 'is-ci';

import { Utilities } from '../Utilities';

describe('IsCI', () => {
  it('determines current mode as CI if RUSH_CI_MODE is set to CI', (done: jest.DoneCallback) => {

    process.env.RUSH_CI_MODE = 'CI';
    expect(Utilities.isCI()).toBe(true);

    done();
  });

  it('determines current mode as CI if RUSH_CI_MODE is set to NON-CI', (done: jest.DoneCallback) => {

    process.env.RUSH_CI_MODE = 'NON-CI';
    expect(Utilities.isCI()).toBe(false);

    done();
  });

  it(
    'determines current mode as returned by the isCI package if RUSH_CI_MODE is neither set to CI nor to NON-CI',
    (done: jest.DoneCallback) => {

      process.env.RUSH_CI_MODE = 'ABC';
      expect(Utilities.isCI()).toBe(isCI);

      done();
    }
  );

  it(
    'determines current mode as returned by the isCI package if RUSH_CI_MODE is neither set to CI nor to NON-CI',
    (done: jest.DoneCallback) => {

      process.env.RUSH_CI_MODE = '';
      expect(Utilities.isCI()).toBe(isCI);

      done();
    }
  );

  it(
    'determines current mode as returned by the isCI package if RUSH_CI_MODE is neither set to CI nor to NON-CI',
    (done: jest.DoneCallback) => {

      delete process.env.RUSH_CI_MODE;
      expect(Utilities.isCI()).toBe(isCI);

      done();
    }
  );
});