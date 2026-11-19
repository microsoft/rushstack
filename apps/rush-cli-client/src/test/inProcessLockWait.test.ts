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
  connectOrAwaitDaemonStartupAsync,
  executeWithDaemonRestartAsync,
  type DaemonClient
} from '@rushstack/rush-client-core';

import * as connectionOptions from '../daemonConnectionOptions';
import { getInProcessLockWaitDeadlineMs, setInProcessLockWait } from '../inProcessLockWait';
import { getBundledRushVersion } from '../lazyRushModules';
import { launchClientAsync } from '../launchClient';

// Rush reads these names from EnvironmentVariableNames in @microsoft/rush-lib.
const DEADLINE: string = '_RUSH_LOCK_WAIT_DEADLINE';
const DAEMON_PID: string = '_RUSH_LOCK_WAIT_DAEMON_PID';

// Rushx keeps a script that has a terminal in-process, so the rushx test hides the test runner's terminal.
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

describe(getInProcessLockWaitDeadlineMs.name, () => {
  it('counts the wait timeout from when the wait began', () => {
    expect(
      getInProcessLockWaitDeadlineMs({
        startedAtMs: 1000,
        admission: { waitTimeoutMs: 30000, waitTimeoutIsDefault: true },
        daemonPid: 42
      })
    ).toBe(31000);
    expect(
      getInProcessLockWaitDeadlineMs({
        startedAtMs: 1000,
        admission: { waitTimeoutMs: 60500 },
        daemonPid: 42
      })
    ).toBe(61500);
  });

  it('does not wait with --no-wait, a zero timeout, or no admission options', () => {
    for (const admission of [{ noWait: true }, { waitTimeoutMs: 0 }, undefined]) {
      expect(getInProcessLockWaitDeadlineMs({ startedAtMs: 1000, admission, daemonPid: 42 })).toBe(1000);
    }
  });
});

describe(setInProcessLockWait.name, () => {
  it('sets the deadline and the daemon PID', () => {
    const environment: NodeJS.ProcessEnv = { PATH: '/bin' };
    setInProcessLockWait(environment, {
      startedAtMs: 1000,
      admission: { waitTimeoutMs: 5000 },
      daemonPid: 42
    });
    expect(environment).toEqual({ PATH: '/bin', [DEADLINE]: '6000', [DAEMON_PID]: '42' });
  });

  it('removes a daemon PID that no daemon handed over', () => {
    const environment: NodeJS.ProcessEnv = { [DAEMON_PID]: '7' };
    setInProcessLockWait(environment, {
      startedAtMs: 1000,
      admission: { noWait: true },
      daemonPid: undefined
    });
    expect(environment).toEqual({ [DEADLINE]: '1000' });
  });
});

describe('rush-client asks in-process Rush to wait for the repository lock after it tried the daemon', () => {
  const SENT_AT_MS: number = 1_000_000;
  let folder: string;
  let originalArgv: string[];
  let originalEnvironment: NodeJS.ProcessEnv;
  let now: jest.SpyInstance<number, []>;

  function writeRushJson(rushVersion: string): void {
    fs.writeFileSync(
      path.join(folder, 'rush.json'),
      JSON.stringify({ rushVersion, pnpmVersion: '10.27.0', projects: [] })
    );
  }

  function mockDaemon(pid: number): void {
    jest.mocked(connectOrAwaitDaemonStartupAsync).mockResolvedValue({
      status: Promise.resolve({ pid }),
      closeAsync: async () => undefined
    } as unknown as DaemonClient);
  }

  /** The daemon takes 20 s to hand the request back. */
  function mockHandBack(successorPid?: number): void {
    jest.mocked(executeWithDaemonRestartAsync).mockImplementation(async (client, connection, options) => {
      now.mockReturnValue(SENT_AT_MS + 20000);
      if (successorPid !== undefined) {
        await options.onRestartAsync?.({ restart: 1, reason: undefined, successorPid });
      }
      return { kind: 'fallback', reason: 'unsupported', message: 'The daemon cannot run this command.' };
    });
  }

  function getLockWait(): { deadline?: string; daemonPid?: string } {
    return { deadline: process.env[DEADLINE], daemonPid: process.env[DAEMON_PID] };
  }

  beforeEach(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-client-lock-wait-'));
    originalArgv = process.argv;
    originalEnvironment = process.env;
    writeRushJson(getBundledRushVersion());
    jest.spyOn(connectionOptions, 'getDaemonConnectionOptionsAsync').mockResolvedValue({
      paths: {
        runtimeDir: folder,
        socketPath: path.join(folder, 'd.sock'),
        lockfilePath: path.join(folder, 'daemon.pid.json')
      }
    });
    jest.spyOn(process.stderr, 'write').mockReturnValue(true);
    jest.spyOn(process, 'cwd').mockReturnValue(folder);
    now = jest.spyOn(Date, 'now').mockReturnValue(SENT_AT_MS);
    process.argv = [process.execPath, 'rush-client', 'build', '--to', 'project'];
    process.env = { ...originalEnvironment, CI: 'false', RUSH_DAEMON: '1', RUSH_REPORTER: 'legacy' };
    for (const name of ['RUSH_LOG_LEVEL', 'RUSH_PREVIEW_VERSION', DEADLINE, DAEMON_PID])
      delete process.env[name];
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.env = originalEnvironment;
    jest.restoreAllMocks();
    jest.mocked(connectOrAwaitDaemonStartupAsync).mockReset();
    jest.mocked(executeWithDaemonRestartAsync).mockReset();
    fs.rmSync(folder, { recursive: true });
  });

  it('for what is left of the wait timeout when the daemon hands the request back', async () => {
    mockDaemon(42);
    mockHandBack();
    await launchClientAsync(false);
    expect(executeWithDaemonRestartAsync).toHaveBeenCalledTimes(1);
    expect(getLockWait()).toEqual({ deadline: `${SENT_AT_MS + 30000}`, daemonPid: '42' });
  });

  it('naming the daemon that the request followed a restart to', async () => {
    mockDaemon(42);
    mockHandBack(43);
    await launchClientAsync(false);
    expect(getLockWait()).toEqual({ deadline: `${SENT_AT_MS + 30000}`, daemonPid: '43' });
  });

  it('for the explicit wait timeout, and not at all with --no-wait', async () => {
    mockDaemon(42);
    mockHandBack();
    process.argv = [process.execPath, 'rush-client', 'build', '--wait-timeout', '90', '--to', 'project'];
    await launchClientAsync(false);
    expect(getLockWait()).toEqual({ deadline: `${SENT_AT_MS + 90000}`, daemonPid: '42' });

    now.mockReturnValue(SENT_AT_MS);
    process.argv = [process.execPath, 'rush-client', 'build', '--no-wait', '--to', 'project'];
    await launchClientAsync(false);
    expect(getLockWait()).toEqual({ deadline: `${SENT_AT_MS}`, daemonPid: '42' });
  });

  it('for the whole wait timeout when it cannot reach a daemon', async () => {
    jest
      .mocked(connectOrAwaitDaemonStartupAsync)
      .mockRejectedValue(new DaemonClientError('startupFailed', 'No ready daemon; auto-start is disabled.'));
    await launchClientAsync(false);
    expect(getLockWait()).toEqual({ deadline: `${SENT_AT_MS + 30000}`, daemonPid: undefined });
  });

  it('not when the command runs in-process without the daemon', async () => {
    process.env.RUSH_DAEMON = '0';
    await launchClientAsync(false);
    expect(connectOrAwaitDaemonStartupAsync).not.toHaveBeenCalled();
    expect(getLockWait()).toEqual({});
  });

  it('not for rushx, whose script would inherit the variables', async () => {
    const restoreTerminal: () => void = hideTerminal();
    try {
      mockDaemon(42);
      mockHandBack();
      process.argv = [process.execPath, 'rushx-client', 'sample'];
      delete process.env.RUSH_REPORTER;
      await launchClientAsync(true);
      expect(executeWithDaemonRestartAsync).toHaveBeenCalledTimes(1);
      expect(process.argv[1]).toBe(
        path.join(path.dirname(require.resolve('@microsoft/rush/package.json')), 'bin/rushx')
      );
      expect(getLockWait()).toEqual({});
    } finally {
      restoreTerminal();
    }
  });

  it('not when the workspace selects another Rush release, which would not remove the variables', async () => {
    writeRushJson('5.178.1');
    mockDaemon(42);
    mockHandBack();
    await launchClientAsync(false);
    expect(executeWithDaemonRestartAsync).toHaveBeenCalledTimes(1);
    expect(getLockWait()).toEqual({});
  });
});
