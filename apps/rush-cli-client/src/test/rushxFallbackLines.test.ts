// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.mock('@microsoft/rush/lib/start', () => ({}));
jest.mock('@rushstack/rush-client-core', () => ({
  ...jest.requireActual('@rushstack/rush-client-core'),
  connectOrAwaitDaemonStartupAsync: jest.fn(),
  executeWithDaemonRestartAsync: jest.fn()
}));

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  DaemonClientError,
  DaemonStartupPendingError,
  connectOrAwaitDaemonStartupAsync,
  executeWithDaemonRestartAsync,
  type DaemonClient
} from '@rushstack/rush-client-core';

import * as connectionOptions from '../daemonConnectionOptions';
import { launchClientAsync } from '../launchClient';

// Rushx keeps a script that has a terminal in-process, so these tests hide the test runner's terminal.
function hideTerminal(): () => void {
  const streams: object[] = [process.stdin, process.stdout, process.stderr];
  const descriptors: (PropertyDescriptor | undefined)[] = streams.map((stream) =>
    Object.getOwnPropertyDescriptor(stream, 'isTTY')
  );
  for (const stream of streams) {
    Object.defineProperty(stream, 'isTTY', { value: undefined, configurable: true, writable: true });
  }
  return () => {
    streams.forEach((stream, index) => {
      const descriptor: PropertyDescriptor | undefined = descriptors[index];
      if (descriptor) Object.defineProperty(stream, 'isTTY', descriptor);
      else delete (stream as { isTTY?: boolean }).isTTY;
    });
  };
}

describe('rushx-client names itself in the lines about a daemon it did not use', () => {
  let folder: string;
  let originalArgv: string[];
  let originalEnvironment: NodeJS.ProcessEnv;
  let restoreTerminal: () => void;
  let output: jest.SpyInstance;

  beforeEach(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rushx-client-fallback-'));
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
    restoreTerminal = hideTerminal();
    process.argv = [process.execPath, 'rushx-client', 'sample'];
    process.env = { ...originalEnvironment, CI: 'false', RUSH_DAEMON: '1' };
    for (const name of ['RUSH_LOG_LEVEL', 'RUSH_REPORTER', 'RUSH_PREVIEW_VERSION']) delete process.env[name];
  });

  afterEach(() => {
    restoreTerminal();
    process.argv = originalArgv;
    process.env = originalEnvironment;
    jest.restoreAllMocks();
    jest.mocked(connectOrAwaitDaemonStartupAsync).mockReset();
    jest.mocked(executeWithDaemonRestartAsync).mockReset();
    fs.rmSync(folder, { recursive: true });
  });

  function expectInProcessRushx(): void {
    expect(process.argv[1]).toBe(
      path.join(path.dirname(require.resolve('@microsoft/rush/package.json')), 'bin/rushx')
    );
    expect(process.argv.slice(2)).toEqual(['sample']);
  }

  it('when it cannot reach the daemon', async () => {
    jest
      .mocked(connectOrAwaitDaemonStartupAsync)
      .mockRejectedValue(new DaemonClientError('startupFailed', 'No ready daemon; auto-start is disabled.'));
    await launchClientAsync(true);
    expectInProcessRushx();
    expect(output.mock.calls).toEqual([
      ['rushx-client: No ready daemon; auto-start is disabled; using in-process Rush.\n']
    ]);
  });

  it('when the daemon sends the request back', async () => {
    jest.mocked(connectOrAwaitDaemonStartupAsync).mockResolvedValue({
      status: Promise.resolve({ pid: 42 }),
      closeAsync: async () => undefined
    } as unknown as DaemonClient);
    jest.mocked(executeWithDaemonRestartAsync).mockResolvedValue({
      kind: 'fallback',
      reason: 'unsupported',
      message: 'The daemon does not support explicit Rushx invocations; no request was sent.'
    });
    await launchClientAsync(true);
    expect(executeWithDaemonRestartAsync).toHaveBeenCalledTimes(1);
    expectInProcessRushx();
    expect(output.mock.calls).toEqual([
      [
        'rushx-client: The daemon does not support explicit Rushx invocations; no request was sent; ' +
          'using in-process Rush.\n'
      ]
    ]);
  });

  it('when it waits for a daemon that is still starting', async () => {
    const pending: DaemonStartupPendingError = new DaemonStartupPendingError('Still starting.');
    jest.mocked(connectOrAwaitDaemonStartupAsync).mockImplementation(async (options) => {
      options.onAwaitStartup?.('Its startup helper (PID 42) is still waiting for the daemon', 15000);
      throw pending;
    });
    await expect(launchClientAsync(true)).rejects.toBe(pending);
    expect(output.mock.calls).toEqual([
      [
        'rushx-client: The daemon is not ready yet. Its startup helper (PID 42) is still waiting for the ' +
          'daemon, so this command waits up to 15 s more for it instead of running Rush in-process.\n'
      ]
    ]);
  });
});
