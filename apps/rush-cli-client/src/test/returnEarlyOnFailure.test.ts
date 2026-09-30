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
  type DaemonClient
} from '@rushstack/rush-client-core';
import type { IDaemonRequestEnvelope } from '@rushstack/rush-daemon-protocol';

import { AgentProgressRenderer } from '../AgentProgressRenderer';
import * as connectionOptions from '../daemonConnectionOptions';
import { launchClientAsync } from '../launchClient';
import { getTestProcessEnvironment } from './TestProcessEnvironment';

describe('returnEarlyOnFailure', () => {
  let folder: string;
  let originalArgv: string[];
  let originalEnvironment: NodeJS.ProcessEnv;
  let originalExitCode: typeof process.exitCode;
  let requests: IDaemonRequestEnvelope[];

  beforeEach(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-client-early-failure-'));
    originalArgv = process.argv;
    originalEnvironment = process.env;
    originalExitCode = process.exitCode;
    requests = [];
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
    jest.mocked(connectOrAwaitDaemonStartupAsync).mockResolvedValue({
      closeAsync: async () => undefined,
      status: Promise.resolve({ pid: process.pid })
    } as unknown as DaemonClient);
    jest.mocked(executeWithDaemonRestartAsync).mockImplementation(async (client, connection, options) => {
      requests.push(options.request);
      return {
        kind: 'result',
        result: { requestId: options.request.requestId, exitCode: 0, outcome: 'success', aborted: false }
      };
    });
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

  it('is requested by agent output, which reports the failure and leaves the independent work to rushd', async () => {
    const renderer: AgentProgressRenderer = new AgentProgressRenderer({
      commandName: 'build',
      isTTY: false,
      columns: 80,
      write: () => undefined
    });
    await launchClientAsync(false, renderer);
    expect(requests).toHaveLength(1);
    expect(requests[0].returnEarlyOnFailure).toBe(true);
  });

  it('is not requested by the default output, whose collated logs cover the whole request', async () => {
    await launchClientAsync(false);
    expect(requests).toHaveLength(1);
    expect(requests[0]).not.toHaveProperty('returnEarlyOnFailure');
  });
});
