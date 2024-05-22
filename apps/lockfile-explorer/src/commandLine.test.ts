// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { parseCommandLine } from './commandLine';

describe('commandLine', () => {
  describe('parseCommandLine()', () => {
    it('sets showHelp when --help specified', async () => {
      const result = parseCommandLine(['--help'])
      expect(result).toHaveProperty('showedHelp', true);
    });

    it('sets subspace when --subspace specified', async () => {
      const result = parseCommandLine(['--subspace', 'wallet'])
      expect(result).toHaveProperty('subspace', 'wallet');
    });

    it('sets error when --subspace value not missing', async () => {
      const result = parseCommandLine(['--subspace'])
      expect(result).toHaveProperty('error', 'Expecting argument after "--subspace"');
    });
  });
});

