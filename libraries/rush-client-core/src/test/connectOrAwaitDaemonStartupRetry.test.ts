// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { IDaemonPaths } from '@rushstack/rush-daemon-transport';

import type { DaemonClient } from '../DaemonClient';
import { DaemonClientError } from '../DaemonClientError';
import * as DaemonOwnership from '../DaemonOwnership';
import * as DaemonStartup from '../DaemonStartup';
import * as DaemonStartupReservation from '../DaemonStartupReservation';
import * as StartupLock from '../StartupLock';
import * as ConnectOrStartDaemon from '../connectOrStartDaemon';
import {
  connectOrAwaitDaemonStartupAsync,
  type IConnectOrAwaitDaemonStartupOptions
} from '../connectOrAwaitDaemonStartup';

const STARTUP_TIMEOUT_MS: number = 10000;
const HELPER_OWNER: string = 'Its startup helper (PID 4242) is still waiting for the daemon';

// The fixture daemon can't make a startup attempt fail at once, or with a `timeout` error, so these tests
// replace the startup attempt and the checks for a live owner. The owner is a running startup helper.
describe('connectOrAwaitDaemonStartupAsync with startup attempts that fail at once', () => {
  let folder: string;
  let paths: IDaemonPaths;
  let connect: jest.SpyInstance;
  let notices: { owner: string; waitMs: number }[];

  beforeEach(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-client-retry-'));
    paths = {
      runtimeDir: folder,
      socketPath: path.join(folder, 'd.sock'),
      lockfilePath: path.join(folder, 'daemon.pid.json')
    };
    notices = [];
    jest.spyOn(DaemonOwnership, 'isEndpointUnboundAsync').mockResolvedValue(true);
    jest.spyOn(DaemonStartup, 'readDaemonStartupReservation').mockReturnValue({
      contents: 'reservation',
      helper: { pid: 4242, startedAt: 'Tue Sep 29 04:00:00 2026' }
    });
    jest.spyOn(DaemonStartupReservation, 'getStartupHelperState').mockReturnValue('running');
    // Nobody else holds the start mutex.
    jest.spyOn(StartupLock, 'tryAcquireStartupLockAsync').mockResolvedValue({ releaseAsync: async () => {} });
    connect = jest.spyOn(ConnectOrStartDaemon, 'connectOrStartDaemonAsync');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(folder, { recursive: true, force: true });
  });

  function createOptions(): IConnectOrAwaitDaemonStartupOptions {
    return {
      paths,
      startupTimeoutMs: STARTUP_TIMEOUT_MS,
      onAwaitStartup: (owner: string, waitMs: number): void => {
        notices.push({ owner, waitMs });
      }
    };
  }

  it('keeps waiting through a timeout error, as through a failed startup', async () => {
    const client: DaemonClient = {} as DaemonClient;
    connect
      .mockRejectedValueOnce(
        new DaemonClientError('timeout', 'Daemon startup timed out awaiting hello/ping readiness.')
      )
      .mockRejectedValueOnce(
        new DaemonClientError('timeout', 'Daemon startup timed out awaiting hello/ping readiness.')
      )
      .mockResolvedValueOnce(client);

    await expect(connectOrAwaitDaemonStartupAsync(createOptions())).resolves.toBe(client);
    expect(connect).toHaveBeenCalledTimes(3);
    expect(notices).toEqual([{ owner: HELPER_OWNER, waitMs: expect.any(Number) }]);
  });

  it('says once that it waits, and retries every 100 ms with only the time left', async () => {
    const client: DaemonClient = {} as DaemonClient;
    const attempts: { at: number; startupTimeoutMs: number | undefined }[] = [];
    connect.mockImplementation(
      async (options: ConnectOrStartDaemon.IConnectOrStartDaemonOptions): Promise<DaemonClient> => {
        attempts.push({ at: Date.now(), startupTimeoutMs: options.startupTimeoutMs });
        if (attempts.length < 5) {
          throw new DaemonClientError('startupFailed', 'Daemon startup failed.');
        }
        return client;
      }
    );

    await expect(connectOrAwaitDaemonStartupAsync(createOptions())).resolves.toBe(client);
    expect(notices).toEqual([{ owner: HELPER_OWNER, waitMs: expect.any(Number) }]);
    expect(notices[0].waitMs).toBeLessThanOrEqual(STARTUP_TIMEOUT_MS);

    // The first attempt is the caller's own. The first retry follows it at once, with at most the whole
    // second deadline, and each later retry waits about 100 ms and gets only what is left of that deadline.
    expect(attempts).toHaveLength(5);
    expect(attempts[0].startupTimeoutMs).toBe(STARTUP_TIMEOUT_MS);
    expect(attempts[1].startupTimeoutMs).toBeLessThanOrEqual(STARTUP_TIMEOUT_MS);
    for (let i: number = 2; i < attempts.length; i++) {
      expect(attempts[i].at - attempts[i - 1].at).toBeGreaterThanOrEqual(90);
      expect(attempts[i].startupTimeoutMs).toBeLessThanOrEqual(attempts[i - 1].startupTimeoutMs! - 90);
      expect(attempts[i].startupTimeoutMs).toBeGreaterThan(0);
    }
  });

  it('counts a startup reservation that cannot be read as no owner, so the caller can run in-process', async () => {
    jest.spyOn(DaemonStartup, 'readDaemonStartupReservation').mockImplementation(() => {
      throw new Error('EACCES: permission denied');
    });
    const startupError: DaemonClientError = new DaemonClientError('startupFailed', 'Daemon startup failed.');
    connect.mockRejectedValueOnce(startupError);

    await expect(connectOrAwaitDaemonStartupAsync(createOptions())).rejects.toBe(startupError);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(notices).toEqual([]);
  });
});
