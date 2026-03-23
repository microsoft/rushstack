// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Executable } from '@rushstack/node-core-library';

describe('@rushstack/rush-sdk named exports check', () => {
  it('Should import named exports correctly (lib-shim)', async () => {
    const childProcess = Executable.spawn(process.argv0, [
      '-e',
      // Do not use top level await here because it is not supported in Node.js < 20.20
      `
import('@rushstack/rush-sdk').then(({ RushConfiguration }) => {
console.log(typeof RushConfiguration.loadFromConfigurationFile);
    });
`
    ]);
    const { stdout, exitCode, signal } = await Executable.waitForExitAsync(childProcess, {
      encoding: 'utf8'
    });

    expect(stdout.trim()).toEqual('function');
    expect(exitCode).toBe(0);
    expect(signal).toBeNull();
  });

  it('Should import named exports correctly (lib)', async () => {
    const childProcess = Executable.spawn(process.argv0, [
      '-e',
      `
import('@rushstack/rush-sdk/lib/utilities/NullTerminalProvider').then(({ NullTerminalProvider }) => {
console.log(NullTerminalProvider.name);
    });
`
    ]);
    const { stdout, exitCode, signal } = await Executable.waitForExitAsync(childProcess, {
      encoding: 'utf8'
    });

    expect(stdout.trim()).toEqual('NullTerminalProvider');
    expect(exitCode).toBe(0);
    expect(signal).toBeNull();
  });
});
