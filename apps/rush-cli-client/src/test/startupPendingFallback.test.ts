// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.mock('@microsoft/rush/lib/start', () => ({}));
jest.mock('@rushstack/rush-client-core', () => ({
  ...jest.requireActual('@rushstack/rush-client-core'),
  connectOrAwaitDaemonStartupAsync: jest.fn(),
  connectToStartingDaemonAsync: jest.fn()
}));

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  DaemonClientError,
  DaemonStartupPendingError,
  connectOrAwaitDaemonStartupAsync,
  connectToStartingDaemonAsync
} from '@rushstack/rush-client-core';

import { AgentProgressRenderer } from '../AgentProgressRenderer';
import * as connectionOptions from '../daemonConnectionOptions';
import { launchClientAsync } from '../launchClient';

describe('a daemon startup failure', () => {
  let folder: string;
  let originalArgv: string[];
  let originalEnvironment: NodeJS.ProcessEnv;
  let output: jest.SpyInstance;

  beforeEach(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-client-startup-pending-'));
    originalArgv = process.argv;
    originalEnvironment = process.env;
    fs.writeFileSync(
      path.join(folder, 'rush.json'),
      JSON.stringify({ rushVersion: '5.178.1', pnpmVersion: '10.27.0', projects: [] })
    );
    jest.spyOn(connectionOptions, 'getDaemonConnectionOptionsAsync').mockResolvedValue({
      paths: {
        runtimeDir: folder,
        socketPath: path.join(folder, 'd.sock'),
        lockfilePath: path.join(folder, 'daemon.pid.json')
      }
    });
    output = jest.spyOn(process.stderr, 'write').mockReturnValue(true);
    jest.spyOn(process, 'cwd').mockReturnValue(folder);
    process.argv = [process.execPath, 'rush-client', 'build', '--to', 'project'];
    process.env = { ...originalEnvironment, CI: 'false', RUSH_DAEMON: '1', RUSH_REPORTER: 'legacy' };
    delete process.env.RUSH_PREVIEW_VERSION;
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.env = originalEnvironment;
    jest.restoreAllMocks();
    jest.mocked(connectOrAwaitDaemonStartupAsync).mockReset();
    jest.mocked(connectToStartingDaemonAsync).mockReset();
    fs.rmSync(folder, { recursive: true });
  });

  it('fails the command instead of running Rush in-process while daemon startup is pending', async () => {
    jest
      .mocked(connectOrAwaitDaemonStartupAsync)
      .mockRejectedValue(new DaemonStartupPendingError('Another client is still starting the daemon.'));
    await expect(launchClientAsync(false)).rejects.toThrow('Another client is still starting the daemon.');
    expect(connectOrAwaitDaemonStartupAsync).toHaveBeenCalledTimes(1);
    expect(process.argv).toEqual([process.execPath, 'rush-client', 'build', '--to', 'project']);
    expect(output).not.toHaveBeenCalledWith(expect.stringContaining('using in-process Rush'));
  });

  it('says why it keeps waiting for a daemon that is still starting', async () => {
    const pending: DaemonStartupPendingError = new DaemonStartupPendingError('Still starting.');
    jest.mocked(connectOrAwaitDaemonStartupAsync).mockImplementation(async (options) => {
      options.onAwaitStartup?.('Its startup helper (PID 42) is still waiting for the daemon', 15000);
      throw pending;
    });
    await expect(launchClientAsync(false)).rejects.toBe(pending);
    expect(output).toHaveBeenCalledWith(
      'rush-client: The daemon is not ready yet. Its startup helper (PID 42) is still waiting for the daemon, ' +
        'so this command waits up to 15 s more for it instead of running Rush in-process.\n'
    );

    // Agent output shows it as the phase of its progress line instead, and names the live process there.
    output.mockClear();
    const write: jest.Mock = jest.fn();
    const renderer: AgentProgressRenderer = new AgentProgressRenderer({
      commandName: 'build',
      isTTY: false,
      columns: 80,
      write
    });
    await expect(launchClientAsync(false, renderer)).rejects.toBe(pending);
    expect(write).toHaveBeenCalledWith(
      expect.stringContaining(
        'rushd is still starting; waiting for it (up to 15s more) because its startup helper (PID 42) is ' +
          'still waiting for the daemon'
      )
    );
    expect(output).not.toHaveBeenCalledWith(expect.stringContaining('The daemon is not ready yet'));
  });

  it('still runs Rush in-process after a startup failure that no live process owns', async () => {
    jest
      .mocked(connectOrAwaitDaemonStartupAsync)
      .mockRejectedValue(new DaemonClientError('startupFailed', 'No ready daemon; auto-start is disabled.'));
    await launchClientAsync(false);
    expect(process.argv[1]).toBe(
      path.join(path.dirname(require.resolve('@microsoft/rush/package.json')), 'bin/rush')
    );
    expect(process.argv.slice(2)).toEqual(['build', '--to', 'project']);
    expect(output).toHaveBeenCalledWith(
      'rush-client: No ready daemon; auto-start is disabled; using in-process Rush.\n'
    );
  });

  it('fails daemon stop without stopping a daemon that is still starting, and says to run stop again', async () => {
    process.argv = [process.execPath, 'rush-client', 'daemon', 'stop'];
    const pending: string = `The daemon at ${path.join(folder, 'd.sock')} is still starting after 15 s. Another client is still starting the daemon.`;
    jest.mocked(connectToStartingDaemonAsync).mockImplementation(async (options) => {
      options.onAwaitStartup?.('Another client is still starting the daemon', 15000);
      throw new DaemonStartupPendingError(pending);
    });
    const error: Error = await launchClientAsync(false).then(
      () => new Error('Expected daemon stop to fail.'),
      (failure: Error) => failure
    );
    expect(error.message).toBe(
      `${pending} It was not stopped; run "rush-client daemon stop" again once "rush-client daemon status" reports it ready.`
    );
    expect(connectToStartingDaemonAsync).toHaveBeenCalledTimes(1);
    expect(output.mock.calls).toEqual([
      [
        'rush-client: The daemon is not ready yet. Another client is still starting the daemon, ' +
          'so stop waits up to 15 s for it to become ready and then stops it.\n'
      ]
    ]);
    expect(connectOrAwaitDaemonStartupAsync).not.toHaveBeenCalled();
  });
});
