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

import * as connectionOptions from '../daemonConnectionOptions';
import { launchClientAsync } from '../launchClient';

it('keeps the detail lines of a multi-line reason when the daemon sends a request back', async () => {
  const folder: string = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-client-sent-back-'));
  const originalArgv: string[] = process.argv;
  const originalEnvironment: NodeJS.ProcessEnv = process.env;
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
  jest.mocked(connectOrAwaitDaemonStartupAsync).mockResolvedValue({
    status: Promise.resolve({ pid: 42 }),
    closeAsync: async () => undefined
  } as unknown as DaemonClient);
  // The daemon puts the error first and the lines that explain it after it.
  jest.mocked(executeWithDaemonRestartAsync).mockResolvedValue({
    kind: 'fallback',
    reason: 'unsupported',
    message: 'Error reading "/repo/common/config/rush/command-line.json":\n  Unexpected token } at 3:1\n'
  });
  const output: jest.SpyInstance = jest.spyOn(process.stderr, 'write').mockReturnValue(true);
  jest.spyOn(process, 'cwd').mockReturnValue(folder);
  process.argv = [process.execPath, 'rush-client', 'build', '--to', 'project'];
  process.env = { ...originalEnvironment, CI: 'false', RUSH_DAEMON: '1', RUSH_REPORTER: 'legacy' };
  for (const name of ['RUSH_LOG_LEVEL', 'RUSH_PREVIEW_VERSION']) delete process.env[name];
  try {
    await launchClientAsync(false);
    expect(executeWithDaemonRestartAsync).toHaveBeenCalledTimes(1);
    expect(output.mock.calls).toEqual([
      [
        'rush-client: Error reading "/repo/common/config/rush/command-line.json"; using in-process Rush.\n' +
          '    Unexpected token } at 3:1\n'
      ]
    ]);
    expect(process.argv[1]).toBe(
      path.join(path.dirname(require.resolve('@microsoft/rush/package.json')), 'bin/rush')
    );
    expect(process.argv.slice(2)).toEqual(['build', '--to', 'project']);
  } finally {
    process.argv = originalArgv;
    process.env = originalEnvironment;
    jest.restoreAllMocks();
    fs.rmSync(folder, { recursive: true });
  }
});
