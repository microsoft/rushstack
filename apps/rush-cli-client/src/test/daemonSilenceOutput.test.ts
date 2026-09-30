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

import { AgentProgressRenderer } from '../AgentProgressRenderer';
import * as connectionOptions from '../daemonConnectionOptions';
import { launchClientAsync } from '../launchClient';
import { getTestProcessEnvironment } from './TestProcessEnvironment';

const DAEMON_PID: number = 41;

const UNRESPONSIVE: string =
  `rush-client: rushd (PID ${DAEMON_PID}) has not responded for 30s; its process may be stopped or ` +
  'overloaded; on Linux, "rush-client daemon status" says which. This command goes on if rushd responds; ' +
  'interrupt it (Ctrl+C) to stop waiting.\n';
const RESPONDED: string = `rush-client: rushd (PID ${DAEMON_PID}) responded again after 31s.\n`;

describe('the lines about a daemon that stopped responding (task 266)', () => {
  let folder: string;
  let originalArgv: string[];
  let originalEnvironment: NodeJS.ProcessEnv;
  let originalExitCode: typeof process.exitCode;
  let stdout: string[];
  let stderr: string[];
  /** What the client had written to stderr while the daemon was still silent. */
  let stderrWhileSilent: string[] | undefined;

  /** Records each write to `stream`, and completes it at once. */
  function record(stream: NodeJS.WriteStream, chunks: string[]): void {
    jest.spyOn(stream, 'write').mockImplementation(((
      chunk: string | Uint8Array,
      ...rest: unknown[]
    ): boolean => {
      chunks.push(Buffer.from(chunk).toString());
      (rest.find((argument) => typeof argument === 'function') as (() => void) | undefined)?.();
      return true;
    }) as typeof stream.write);
  }

  beforeEach(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-client-daemon-silence-'));
    originalArgv = process.argv;
    originalEnvironment = process.env;
    originalExitCode = process.exitCode;
    stdout = [];
    stderr = [];
    stderrWhileSilent = undefined;
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
    record(process.stdout, stdout);
    record(process.stderr, stderr);
    jest.spyOn(process, 'cwd').mockReturnValue(folder);
    jest.mocked(connectOrAwaitDaemonStartupAsync).mockResolvedValue({
      closeAsync: async () => undefined,
      status: Promise.resolve({ pid: DAEMON_PID })
    } as unknown as DaemonClient);
    // The daemon writes a line of the command's output, then sends nothing for 31 s, which DaemonClient
    // reports once 30 s have passed, then writes another line and the result.
    jest
      .mocked(executeWithDaemonRestartAsync)
      .mockImplementation(async (client, connection, { request, onStdoutAsync, liveness }) => {
        await onStdoutAsync!(Buffer.from('built-a\n'), request.requestId);
        liveness!.onUnresponsive({ pid: DAEMON_PID, silentForMs: 30_000 });
        await new Promise((resolve) => setImmediate(resolve));
        stderrWhileSilent = [...stderr];
        liveness!.onResponsive!({ pid: DAEMON_PID, silentForMs: 31_000 });
        await onStdoutAsync!(Buffer.from('built-b\n'), request.requestId);
        return {
          kind: 'result',
          result: { requestId: request.requestId, exitCode: 0, outcome: 'success', aborted: false }
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

  it("writes them to stderr while the daemon is silent, and leaves stdout to the command's output", async () => {
    await launchClientAsync(false);
    // `rush-client build | grep ...` must not see them.
    expect(stdout.join('')).toBe('built-a\nbuilt-b\n');
    expect(stderrWhileSilent).toEqual([UNRESPONSIVE]);
    expect(stderr).toEqual([UNRESPONSIVE, RESPONDED]);
    expect(process.exitCode).toBe(0);
  });

  it('leaves them to the agent output, and writes none to stderr', async () => {
    const output: string[] = [];
    const renderer: AgentProgressRenderer = new AgentProgressRenderer({
      commandName: 'build',
      isTTY: false,
      columns: 80,
      write: (text: string) => output.push(text)
    });
    await launchClientAsync(false, renderer);
    expect(output.join('').split('\n').slice(0, -1)).toEqual([
      expect.stringMatching(/^rush build · \d+\.\ds · sent to rushd; preparing the workspace graph /),
      expect.stringMatching(
        /^rush build · \d+\.\ds · rushd \(PID 41\) has not responded for 30s; its process may be stopped or overloaded; on Linux, "rush-client daemon status" says which\. This command goes on if rushd responds; interrupt it \(Ctrl\+C\) to stop waiting$/
      ),
      expect.stringMatching(/^rush build · \d+\.\ds · rushd \(PID 41\) responded again after 31s$/),
      expect.stringMatching(/^rush build: SUCCESS/)
    ]);
    expect(stderr).toEqual([]);
    expect(stdout).toEqual([]);
    expect(process.exitCode).toBe(0);
  });
});
