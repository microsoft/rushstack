// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { selectClientRoute, type IClientRoute, type IClientRouteOptions } from '../routing';

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
    { argv: ['build'], enabled: true, environment: { RUSH_REPORTER: ' LEGACY ' }, daemon: true },
    { argv: ['install'], enabled: true, environment: { RUSH_DAEMON: '1' }, daemon: true },
    { argv: ['update'], enabled: true, environment: { RUSH_DAEMON: '1' }, daemon: true },
    { argv: ['install', '--no-daemon'], enabled: true, environment: { RUSH_DAEMON: '1' }, daemon: false },
    { argv: ['install'], enabled: true, environment: { CI: '1' }, daemon: false },
    { argv: ['publish'], enabled: true, environment: { RUSH_DAEMON: '1' }, daemon: false },
    { argv: ['daemon', 'status'], enabled: true, environment: {}, daemon: false },
    { argv: ['--help'], enabled: true, environment: {}, daemon: false },
    { argv: ['build', '--help'], enabled: true, environment: {}, daemon: false },
    { argv: ['build', '--reporter=ai'], enabled: true, environment: {}, daemon: false },
    { argv: ['build', '--reporter', 'ai'], enabled: true, environment: {}, daemon: false },
    { argv: ['build', '--reporter=ai', '--no-daemon'], enabled: true, environment: {}, daemon: false },
    { argv: ['build'], enabled: true, environment: { RUSH_REPORTER: 'ai' }, daemon: false },
    { argv: ['build'], enabled: true, environment: {}, useRushReporter: true, daemon: false },
    { argv: ['build'], enabled: true, environment: {}, useRushReporter: false, daemon: true }
  ])('selects $daemon for $argv', ({ daemon, ...options }) => {
    expect(selectClientRoute({ ...options, rushx: false }).daemon).toBe(daemon);
  });

  it('forwards an explicit AI reporter flag unchanged to the native path', () => {
    expect(
      selectClientRoute({ argv: ['build', '--reporter', 'ai'], enabled: true, environment: {}, rushx: false })
    ).toMatchObject({ argv: ['build', '--reporter', 'ai'], daemon: false });
  });

  it('ignores useRushReporter for rushx scripts', () => {
    expect(
      selectClientRoute({ argv: ['build'], enabled: true, environment: {}, rushx: true, useRushReporter: true })
        .daemon
    ).toBe(true);
  });

  it('preserves script arguments after -- and permits scripts named like built-ins', () => {
    expect(
      selectClientRoute({
        argv: ['install', '--', '--no-daemon'],
        enabled: true,
        environment: {},
        rushx: true
      })
    ).toEqual({
      argv: ['install', '--', '--no-daemon'],
      nativeArgv: ['install', '--', '--no-daemon'],
      commandName: 'install',
      daemon: true
    });
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

describe('global flags before the command', () => {
  it.each([
    { argv: ['-q', 'build', '--to', 'a'], daemonArgv: ['build', '--to', 'a'] },
    { argv: ['--quiet', 'build'], daemonArgv: ['build'] },
    { argv: ['--quiet', '-q', 'rebuild', '-q'], daemonArgv: ['rebuild', '-q'] },
    { argv: ['--no-wait', '-q', 'build'], daemonArgv: ['build'] }
  ])('leaves the leading quiet flags of $argv out of the daemon request only', ({ argv, daemonArgv }) => {
    expect(selectClientRoute({ argv, enabled: true, environment: {}, rushx: false })).toEqual({
      argv: daemonArgv,
      nativeArgv: argv.filter((arg) => arg !== '--no-wait'),
      commandName: daemonArgv[0],
      daemon: true,
      admission: argv.includes('--no-wait') ? { noWait: true } : undefined
    });
  });

  it('keeps every flag for in-process Rush', () => {
    expect(
      selectClientRoute({
        argv: ['-q', '--no-daemon', 'build', '--', '--no-daemon'],
        enabled: true,
        environment: {},
        rushx: false
      })
    ).toEqual({
      argv: ['build', '--', '--no-daemon'],
      nativeArgv: ['-q', 'build', '--', '--no-daemon'],
      commandName: 'build',
      daemon: false,
      admission: undefined
    });
    expect(
      selectClientRoute({ argv: ['-q', '--debug', 'build'], enabled: true, environment: {}, rushx: false })
    ).toMatchObject({ argv: ['--debug', 'build'], nativeArgv: ['-q', '--debug', 'build'], daemon: false });
  });

  it('does not strip Rushx flags, which native Rushx parses', () => {
    expect(
      selectClientRoute({ argv: ['-q', 'build'], enabled: true, environment: {}, rushx: true })
    ).toMatchObject({
      argv: ['-q', 'build'],
      nativeArgv: ['-q', 'build'],
      commandName: 'build',
      daemon: true
    });
  });

  it('routes a quiet daemon command to the client daemon commands', () => {
    expect(
      selectClientRoute({ argv: ['-q', 'daemon', 'status'], enabled: true, environment: {}, rushx: false })
    ).toMatchObject({ argv: ['daemon', 'status'], commandName: 'daemon', daemon: false });
  });
});

describe('in-process reasons', () => {
  it.each([
    {
      argv: ['build'],
      environment: { RUSH_LOG_LEVEL: 'debug' },
      reason: 'RUSH_LOG_LEVEL selects the native reporter'
    },
    {
      argv: ['build'],
      environment: { RUSH_REPORTER: ' json ' },
      reason: 'RUSH_REPORTER=json selects the native reporter'
    },
    { argv: ['build', '--reporter=ai'], reason: '--reporter selects the native reporter' },
    { argv: ['build', '--output', 'x.log'], reason: '--output selects the native reporter' },
    { argv: ['build', '--log-level=debug'], reason: '--log-level selects the native reporter' },
    {
      argv: ['build'],
      useRushReporter: true,
      reason: 'useRushReporter in experiments.json selects the native reporter'
    },
    { argv: ['--debug', 'build'], reason: 'the daemon does not support "--debug"' },
    { argv: ['-q', '-d', 'build'], reason: 'the daemon does not support "-d"' },
    { argv: ['check'], reason: 'the daemon does not run "check"' },
    {
      argv: ['-q', 'update-autoinstaller', '--name', 'x'],
      reason: 'the daemon does not run "update-autoinstaller"'
    },
    {
      argv: ['build'],
      enabled: false,
      environment: { RUSH_DAEMON: '0' },
      reason: 'RUSH_DAEMON=0 turns the daemon off'
    },
    { argv: ['build'], enabled: false, reason: 'the daemon is not enabled for this repo' },
    {
      argv: ['build'],
      environment: { CI: 'true' },
      reason: 'CI is set, so the daemon is off unless RUSH_DAEMON=1'
    },
    {
      argv: ['build'],
      environment: { CI: '0', TF_BUILD: 'True' },
      reason: 'TF_BUILD is set, so the daemon is off unless RUSH_DAEMON=1'
    },
    // The first reason that applies is given.
    {
      argv: ['--debug', 'check', '--reporter=json'],
      enabled: false,
      environment: { CI: '1' },
      reason: '--reporter selects the native reporter'
    },
    { argv: ['--debug', 'check'], enabled: false, reason: 'the daemon does not support "--debug"' },
    { argv: ['check'], enabled: false, environment: { CI: '1' }, reason: 'the daemon does not run "check"' },
    {
      argv: ['build'],
      enabled: false,
      environment: { CI: '1' },
      reason: 'the daemon is not enabled for this repo'
    }
  ])('says "$reason" for $argv', ({ reason, enabled = true, environment = {}, ...options }) => {
    expect(selectClientRoute({ ...options, enabled, environment, rushx: false })).toMatchObject({
      daemon: false,
      inProcessReason: reason
    });
  });

  it.each([
    { argv: ['build', '--no-daemon'] },
    { argv: ['build', '--help'] },
    { argv: ['-h'] },
    { argv: ['help', 'build'] },
    { argv: ['-q'] },
    { argv: [] }
  ])('gives no reason when $argv asks for in-process Rush or has no command', ({ argv }) => {
    const route: IClientRoute = selectClientRoute({
      argv,
      enabled: false,
      environment: { CI: '1' },
      rushx: false
    });
    expect(route.daemon).toBe(false);
    expect(route).not.toHaveProperty('inProcessReason');
  });

  it('gives no reason for a daemon request', () => {
    expect(
      selectClientRoute({ argv: ['build'], enabled: true, environment: {}, rushx: false })
    ).not.toHaveProperty('inProcessReason');
  });

  it('gives the Rushx reasons', () => {
    const route = (options: Partial<IClientRouteOptions>): IClientRoute =>
      selectClientRoute({ argv: ['build'], enabled: true, environment: {}, rushx: true, ...options });
    expect(route({ hasTerminal: true }).inProcessReason).toBe(
      'the daemon does not run scripts in a terminal'
    );
    expect(route({ environment: { RUSH_REPORTER: 'json' } }).inProcessReason).toBe(
      'RUSH_REPORTER=json selects the native reporter'
    );
    expect(route({ argv: ['build', '--reporter=json'] })).not.toHaveProperty('inProcessReason');
    expect(route({ argv: ['check'] })).not.toHaveProperty('inProcessReason');
    expect(route({ enabled: false }).inProcessReason).toBe('the daemon is not enabled for this repo');
  });
});
