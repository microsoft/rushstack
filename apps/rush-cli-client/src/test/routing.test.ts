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
    { argv: ['build', '--reporter=json'], enabled: true, environment: {}, daemon: false },
    { argv: ['build', '--output', 'build.log'], enabled: true, environment: {}, daemon: false },
    { argv: ['build', '--log-level=debug'], enabled: true, environment: {}, daemon: false },
    { argv: ['build'], enabled: true, environment: { RUSH_REPORTER: 'json' }, daemon: false },
    { argv: ['build'], enabled: true, environment: { RUSH_REPORTER: 'legacy' }, daemon: true },
    { argv: ['install'], enabled: true, environment: { RUSH_DAEMON: '1' }, daemon: true },
    { argv: ['update'], enabled: true, environment: { RUSH_DAEMON: '1' }, daemon: true },
    { argv: ['install', '--no-daemon'], enabled: true, environment: { RUSH_DAEMON: '1' }, daemon: false },
    { argv: ['install'], enabled: true, environment: { CI: '1' }, daemon: false },
    { argv: ['publish'], enabled: true, environment: { RUSH_DAEMON: '1' }, daemon: false },
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

  it('uses native Rushx option boundaries instead of treating script flags as Rush options', () => {
    const argv: string[] = ['-q', '-d', '--ignore-hooks', 'build', '--help', '--reporter=json', '--', '-h'];
    expect(selectClientRoute({ argv, enabled: true, environment: {}, rushx: true })).toMatchObject({
      argv,
      commandName: 'build',
      daemon: true
    });

    expect(
      selectClientRoute({
        argv: ['--unknown', 'build'],
        enabled: true,
        environment: {},
        rushx: true
      }).daemon
    ).toBe(false);
  });

  it('keeps unknown interactive Rushx scripts native before daemon connection or input admission', () => {
    expect(
      selectClientRoute({
        argv: ['script'],
        enabled: true,
        environment: { RUSH_DAEMON: '1' },
        rushx: true,
        hasTerminal: true
      }).daemon
    ).toBe(false);
    expect(
      selectClientRoute({
        argv: ['script'],
        enabled: true,
        environment: { RUSH_DAEMON: '1' },
        rushx: true,
        hasTerminal: false
      }).daemon
    ).toBe(true);
    expect(
      selectClientRoute({
        argv: ['build'],
        enabled: true,
        environment: { RUSH_DAEMON: '1' },
        rushx: false,
        hasTerminal: true
      }).daemon
    ).toBe(true);
  });
});
