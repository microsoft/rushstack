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
  connectOrAwaitDaemonStartupAsync,
  executeWithDaemonRestartAsync,
  DaemonClient
} from '@rushstack/rush-client-core';

import * as connectionOptions from '../daemonConnectionOptions';
import { GraphRequestContext } from '../GraphRequestContext';
import { launchClientAsync } from '../launchClient';
import { getTestProcessEnvironment } from './TestProcessEnvironment';

describe('omitWarmSetStatus', () => {
  let folder: string;
  let originalArgv: string[];
  let originalEnvironment: NodeJS.ProcessEnv;
  let originalExitCode: typeof process.exitCode;
  const client: DaemonClient = {
    closeAsync: async () => undefined,
    status: Promise.resolve({ pid: process.pid })
  } as unknown as DaemonClient;

  beforeEach(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-client-warm-set-status-'));
    originalArgv = process.argv;
    originalEnvironment = process.env;
    originalExitCode = process.exitCode;
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
    jest.spyOn(process.stderr, 'write').mockReturnValue(true);
    jest.spyOn(process.stdout, 'write').mockReturnValue(true);
    jest.spyOn(process, 'cwd').mockReturnValue(folder);
    jest.mocked(connectOrAwaitDaemonStartupAsync).mockResolvedValue(client);
    jest.mocked(executeWithDaemonRestartAsync).mockImplementation(async (daemon, connection, options) => ({
      kind: 'result',
      result: { requestId: options.request.requestId, exitCode: 0, outcome: 'success', aborted: false }
    }));
    process.argv = [process.execPath, 'rush-client', 'build', '--to', 'project'];
    const environment: NodeJS.ProcessEnv = getTestProcessEnvironment(originalEnvironment);
    for (const name of Object.keys(environment)) {
      if (name.startsWith('RUSH_')) delete environment[name];
    }
    process.env = { ...environment, RUSH_DAEMON: '1' };
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.env = originalEnvironment;
    process.exitCode = originalExitCode;
    jest.restoreAllMocks();
    jest.mocked(connectOrAwaitDaemonStartupAsync).mockReset();
    jest.mocked(executeWithDaemonRestartAsync).mockReset();
    fs.rmSync(folder, { recursive: true });
  });

  it('is set by a command, both when it connects and when it reconnects to a restarted daemon', async () => {
    await launchClientAsync(false);
    expect(connectOrAwaitDaemonStartupAsync).toHaveBeenCalledTimes(1);
    expect(connectOrAwaitDaemonStartupAsync).toHaveBeenCalledWith(
      expect.objectContaining({ omitWarmSetStatus: true })
    );
    expect(executeWithDaemonRestartAsync).toHaveBeenCalledTimes(1);
    expect(executeWithDaemonRestartAsync).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ omitWarmSetStatus: true }),
      expect.anything()
    );
  });

  it('is set by a graph request', async () => {
    const connect = jest.spyOn(DaemonClient, 'connectAsync').mockResolvedValue(client);
    const context: GraphRequestContext = new GraphRequestContext({});
    try {
      expect(await context.connectAsync({ socketPath: 'socket' })).toBe(client);
    } finally {
      context[Symbol.dispose]();
    }
    expect(connect).toHaveBeenCalledWith(
      expect.objectContaining({ socketPath: 'socket', omitWarmSetStatus: true })
    );
  });
});
