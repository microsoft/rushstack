// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { selectClientRoute } from '../routing';

describe('opt-in routing', () => {
  it.each([
    { argv: ['build'], enabled: false, environment: {}, daemon: false },
    { argv: ['build'], enabled: true, environment: {}, daemon: true },
    { argv: ['build', '--no-daemon'], enabled: true, environment: { RUSH_DAEMON: '1' }, daemon: false },
    { argv: ['build'], enabled: true, environment: { CI: '1' }, daemon: false },
    { argv: ['build'], enabled: true, environment: { CI: '1', RUSH_DAEMON: '1' }, daemon: true },
    { argv: ['build'], enabled: true, environment: { CI: 'false' }, daemon: true },
    { argv: ['install'], enabled: true, environment: { RUSH_DAEMON: '1' }, daemon: false },
    { argv: ['daemon', 'status'], enabled: true, environment: {}, daemon: false },
    { argv: ['--help'], enabled: true, environment: {}, daemon: false },
    { argv: ['build', '--help'], enabled: true, environment: {}, daemon: false }
  ])('selects $daemon for $argv', ({ daemon, ...options }) => {
    expect(selectClientRoute({ ...options, rushx: false }).daemon).toBe(daemon);
  });

  it('preserves script arguments after -- and permits scripts named like built-ins', () => {
    expect(
      selectClientRoute({
        argv: ['install', '--', '--no-daemon'],
        enabled: true,
        environment: {},
        rushx: true
      })
    ).toEqual({ argv: ['install', '--', '--no-daemon'], commandName: 'install', daemon: true });
  });
});
