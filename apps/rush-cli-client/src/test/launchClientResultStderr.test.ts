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
import type { IDaemonCommandResult } from '@rushstack/rush-daemon-protocol';

import type { ClientName } from '../ClientAdmissionControls';
import * as connectionOptions from '../daemonConnectionOptions';
import { launchClientAsync } from '../launchClient';
import { getTestProcessEnvironment } from './TestProcessEnvironment';

const RESTART_WAIT_TIMEOUT: string =
  'The rushx script was not admitted before the daemon could restart because ' +
  'common/config/rush/pnpm-lock.yaml changed. Stop the script, or use --wait-timeout <seconds> to wait longer.';

describe('the stderr line of a failed daemon result (task 166)', () => {
  let folder: string;
  let originalArgv: string[];
  let originalEnvironment: NodeJS.ProcessEnv;
  let originalExitCode: typeof process.exitCode;
  let stderr: string[];

  beforeEach(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-client-result-'));
    originalArgv = process.argv;
    originalEnvironment = process.env;
    originalExitCode = process.exitCode;
    stderr = [];
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
    jest.spyOn(process.stderr, 'write').mockImplementation(((
      chunk: string | Uint8Array,
      ...rest: unknown[]
    ): boolean => {
      stderr.push(Buffer.from(chunk).toString());
      (rest.find((argument) => typeof argument === 'function') as (() => void) | undefined)?.();
      return true;
    }) as typeof process.stderr.write);
    jest.spyOn(process.stdout, 'write').mockReturnValue(true);
    jest.spyOn(process, 'cwd').mockReturnValue(folder);
    jest.mocked(connectOrAwaitDaemonStartupAsync).mockResolvedValue({
      closeAsync: async () => undefined,
      status: Promise.resolve({ pid: process.pid })
    } as unknown as DaemonClient);
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

  describe.each<[ClientName, boolean, string[]]>([
    ['rush-client', false, ['build', '--to', 'project']],
    ['rushx-client', true, ['serve']]
  ])('of %s', (clientName: ClientName, rushx: boolean, argv: string[]) => {
    it.each<[string, Omit<IDaemonCommandResult, 'requestId'>, string]>([
      [
        "the daemon's error",
        {
          exitCode: 1,
          outcome: 'failure',
          aborted: false,
          errorMessage: 'The daemon shut down before the request ran.'
        },
        `${clientName}: The daemon shut down before the request ran.\n`
      ],
      [
        "the daemon's reason for an admission failure",
        {
          exitCode: 1,
          outcome: 'failure',
          aborted: false,
          admissionErrorCode: 'wait-timeout',
          errorMessage: RESTART_WAIT_TIMEOUT
        },
        `${clientName}: daemon admission failed (wait-timeout): ${RESTART_WAIT_TIMEOUT}\n`
      ]
    ])('names the client before %s', async (name, result, line) => {
      process.argv = [process.execPath, clientName, ...argv];
      jest.mocked(executeWithDaemonRestartAsync).mockImplementation(async (client, connection, options) => ({
        kind: 'result',
        result: { requestId: options.request.requestId, ...result }
      }));
      await launchClientAsync(rushx);
      expect(jest.mocked(executeWithDaemonRestartAsync).mock.calls[0][2].request.invocationKind).toBe(
        rushx ? 'rushx' : 'rush'
      );
      expect(stderr).toEqual([line]);
      expect(process.exitCode).toBe(1);
    });
  });
});
