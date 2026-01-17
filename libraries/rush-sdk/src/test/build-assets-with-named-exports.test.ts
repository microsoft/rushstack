// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Executable } from '@rushstack/node-core-library';

describe('@rushstack/rush-sdk named exports check', () => {
  it('Should import named exports correctly (lib-shim)', () => {
    const result = Executable.spawnSync('node', [
      '-e',
      // Do not use top level await here because it is not supported in Node.js < 20.20
      `
import('@rushstack/rush-sdk').then(({ RushConfiguration }) => {
console.log(typeof RushConfiguration.loadFromConfigurationFile);
    });
`
    ]);
    expect(result.stdout.trim()).toEqual('function');
    expect(result.status).toBe(0);
  });

  it('Should import named exports correctly (lib)', () => {
    const result = Executable.spawnSync('node', [
      '-e',
      `
import('@rushstack/rush-sdk/lib/api/RushConfiguration').then(({ RushConfiguration }) => {
console.log(typeof RushConfiguration.loadFromConfigurationFile);
    });
`
    ]);
    expect(result.stdout.trim()).toEqual('function');
    expect(result.status).toBe(0);
  });
});
