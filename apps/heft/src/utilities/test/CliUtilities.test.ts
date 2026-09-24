// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { getToolParameterNamesFromArgs } from '../CliUtilities';

// The version selector and the command line parser both rely on this "tool parameters precede the action"
// scan to find --debug / --unmanaged before the full parser runs.
describe(getToolParameterNamesFromArgs.name, () => {
  function scan(...args: string[]): string[] {
    return Array.from(getToolParameterNamesFromArgs(['node', 'heft', ...args]));
  }

  it('returns the dash-prefixed arguments that precede the action name', () => {
    expect(scan('--debug', '--unmanaged', 'build', '--clean')).toEqual(['--debug', '--unmanaged']);
  });

  it('stops at the first argument that does not start with a dash', () => {
    expect(scan('build', '--debug')).toEqual([]);
    expect(scan('--debug', 'run', '--only', 'build', '--', '--unmanaged')).toEqual(['--debug']);
  });

  it('includes every dash-prefixed token, including unknown flags and "--"', () => {
    expect(scan('-h', '--nosuch', '--', '--debug')).toEqual(['-h', '--nosuch', '--', '--debug']);
  });

  it('de-duplicates repeated flags', () => {
    expect(scan('--debug', '--debug')).toEqual(['--debug']);
  });

  it('returns an empty set when there are no tool arguments', () => {
    expect(scan()).toEqual([]);
  });

  it('skips the node executable and script path', () => {
    expect(Array.from(getToolParameterNamesFromArgs(['--debug', '--unmanaged']))).toEqual([]);
  });
});
