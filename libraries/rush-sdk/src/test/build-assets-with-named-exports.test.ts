// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Executable } from '@rushstack/node-core-library';

describe('@rushstack/rush-sdk named exports check', () => {
  it('Should import named exports correctly (lib-shim)', () => {
    const result = Executable.spawnSync('node', [
      '-e',
      `
const { RushConfiguration } = await import('@rushstack/rush-sdk');
console.log(typeof RushConfiguration.loadFromConfigurationFile);
`
    ]);
    expect(result.stdout.trim()).toEqual('function');
    expect(result.status).toBe(0);
  });

  it('Should import named exports correctly (lib)', () => {
    const result = Executable.spawnSync('node', [
      '-e',
      `
const { RushConfiguration } = await import('@rushstack/rush-sdk/lib/api/RushConfiguration');
console.log(typeof RushConfiguration.loadFromConfigurationFile);
`
    ]);
    expect(result.stdout.trim()).toEqual('function');
    expect(result.status).toBe(0);
  });
});
