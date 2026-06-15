// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { RushPnpmCommandLineParser } from '../RushPnpmCommandLineParser';

interface IRushPnpmCommandLineParserInternals {
  _validatePnpmUsageAsync(pnpmArgs: string[]): Promise<void>;
}

async function validatePnpmArgsAsync(pnpmArgs: string[]): Promise<string[]> {
  const parser: IRushPnpmCommandLineParserInternals = Object.create(RushPnpmCommandLineParser.prototype);
  await parser._validatePnpmUsageAsync(pnpmArgs);
  return pnpmArgs;
}

describe(RushPnpmCommandLineParser.name, () => {
  it('adds recursive mode to workspace query commands by default', async () => {
    await expect(validatePnpmArgsAsync(['outdated'])).resolves.toEqual(['outdated', '--recursive']);
    await expect(validatePnpmArgsAsync(['why', '@rushstack/node-core-library'])).resolves.toEqual([
      'why',
      '--recursive',
      '@rushstack/node-core-library'
    ]);
  });

  it('does not duplicate explicit recursive flags', async () => {
    await expect(validatePnpmArgsAsync(['outdated', '-r'])).resolves.toEqual(['outdated', '-r']);
    await expect(
      validatePnpmArgsAsync(['why', '--recursive', '@rushstack/node-core-library'])
    ).resolves.toEqual(['why', '--recursive', '@rushstack/node-core-library']);
  });

  it('does not force recursive mode for global outdated checks', async () => {
    await expect(validatePnpmArgsAsync(['outdated', '--global'])).resolves.toEqual(['outdated', '--global']);
  });
});
