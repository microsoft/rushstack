// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as isCI from 'is-ci';

import { RushCiMode } from '../RushCiMode';

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
    RushCiMode.initialize('');
    RushCiMode.initialize('CI');
    RushCiMode.initialize('CI');
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
    RushCiMode.initialize('NON-CI');
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

      done();
    }
  );
});