// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { MinimalRushConfiguration } from '../MinimalRushConfiguration';

describe(MinimalRushConfiguration.name, () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('legacy rush config', () => {
    beforeEach(() => {
      jest.spyOn(process, 'cwd').mockReturnValue(path.join(__dirname, 'sandbox', 'legacy-repo', 'project'));
    });

    it('correctly loads the rush.json file', () => {
      const config: MinimalRushConfiguration =
        MinimalRushConfiguration.loadFromDefaultLocation() as MinimalRushConfiguration;
      expect(config.rushVersion).toEqual('2.5.0');
    });
  });

  describe('non-legacy rush config', () => {
    beforeEach(() => {
      jest.spyOn(process, 'cwd').mockReturnValue(path.join(__dirname, 'sandbox', 'repo', 'project'));
    });

    it('correctly loads the rush.json file', () => {
      const config: MinimalRushConfiguration =
        MinimalRushConfiguration.loadFromDefaultLocation() as MinimalRushConfiguration;
      expect(config.rushVersion).toEqual('4.0.0');
    });
  });
});
