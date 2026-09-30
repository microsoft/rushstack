// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { setTimeout as delayAsync } from 'node:timers/promises';

import { createDaemonTestRuntimeBase } from './DaemonTestRuntimeBase';
import { createTemporaryRepo } from './TemporaryRepoWorkspaceSession';

const RUSHD_PATH: string = path.join(__dirname, '..', 'start.js');
const POLL_INTERVAL_MS: number = 20;
const START_TIMEOUT_MS: number = 15000;
// Far longer than the daemon takes to write its ready line once it listens.
const AFTER_READY_MS: number = 500;
const READY_LINE: RegExp = /rushd ready at (\S+) \(PID \d+\)\n/;

interface IProcessExit {
  readonly code: number | undefined;
  readonly signal: NodeJS.Signals | undefined;
}

interface IRushd {
  readonly process: ChildProcess;
  readonly exited: Promise<IProcessExit>;
  readonly getStderr: () => string;
}

// As after `rushd 2>&1 | tee rushd.log`, when Ctrl+C stops tee as well as rushd.
(process.platform === 'win32' ? describe.skip : describe)('rushd when nothing reads its output', () => {
  let folder: string;
  let repoRoot: string;
  let runtimeBase: string;
  let rushd: IRushd | undefined;

  beforeEach(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rushd-closed-output-'));
    repoRoot = path.join(folder, 'repo');
    runtimeBase = createDaemonTestRuntimeBase();
    createTemporaryRepo(repoRoot);
  });

  afterEach(async () => {
    const started: IRushd | undefined = rushd;
    rushd = undefined;
    // Only the rushd process that this test started, if a failed test left it running.
    if (started && started.process.exitCode === null && started.process.signalCode === null) {
      started.process.kill('SIGKILL');
      await started.exited;
    }
    fs.rmSync(folder, { force: true, recursive: true });
    fs.rmSync(runtimeBase, { force: true, recursive: true });
  });

  function startRushd(): IRushd {
    const child: ChildProcess = spawn(process.execPath, [RUSHD_PATH], {
      cwd: repoRoot,
      env: { ...process.env, RUSHD_RUNTIME_DIR: runtimeBase, RUSH_TEMP_FOLDER: undefined },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stderr: string = '';
    child.stderr?.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk));
    const exited: Promise<IProcessExit> = new Promise((resolve) => {
      child.once('exit', (code, signal) => resolve({ code: code ?? undefined, signal: signal ?? undefined }));
    });
    rushd = { process: child, exited, getStderr: () => stderr };
    return rushd;
  }

  /** Resolves with the socket path from the ready line. */
  function readReadyLineAsync(started: IRushd): Promise<string> {
    return new Promise((resolve, reject) => {
      let stdout: string = '';
      const timer: NodeJS.Timeout = setTimeout(
        () => reject(new Error(`rushd was not ready within ${START_TIMEOUT_MS} ms:\n${started.getStderr()}`)),
        START_TIMEOUT_MS
      );
      started.process.stdout?.setEncoding('utf8').on('data', (chunk: string) => {
        stdout += chunk;
        const match: RegExpExecArray | null = READY_LINE.exec(stdout);
        if (match) {
          clearTimeout(timer);
          resolve(match[1]);
        }
      });
      void started.exited.then(({ code, signal }) => {
        clearTimeout(timer);
        reject(new Error(`rushd exited (${code ?? signal}) before it was ready:\n${started.getStderr()}`));
      });
    });
  }

  /** Resolves with the socket path, once rushd has written its socket and lockfile. */
  async function waitForDaemonFilesAsync(started: IRushd): Promise<string> {
    const deadlineMs: number = Date.now() + START_TIMEOUT_MS;
    while (true) {
      for (const runtimeDir of fs.readdirSync(runtimeBase)) {
        const names: string[] = fs.readdirSync(path.join(runtimeBase, runtimeDir));
        const socketName: string | undefined = names.find((name) => name.endsWith('.sock'));
        if (socketName && names.includes(lockfileNameOf(socketName))) {
          return path.join(runtimeBase, runtimeDir, socketName);
        }
      }
      if (started.process.exitCode !== null || Date.now() > deadlineMs) {
        throw new Error(`rushd did not write its socket and lockfile:\n${started.getStderr()}`);
      }
      await delayAsync(POLL_INTERVAL_MS);
    }
  }

  function lockfileNameOf(socketName: string): string {
    return socketName.replace(/\.sock$/, '.pid.json');
  }

  function getDaemonFiles(socketPath: string): { socket: boolean; lockfile: boolean } {
    const lockfilePath: string = path.join(
      path.dirname(socketPath),
      lockfileNameOf(path.basename(socketPath))
    );
    return { socket: fs.existsSync(socketPath), lockfile: fs.existsSync(lockfilePath) };
  }

  it.each<NodeJS.Signals>(['SIGTERM', 'SIGINT'])(
    'stops on %s and removes its socket and lockfile when nothing reads its stderr',
    async (signal: NodeJS.Signals) => {
      const started: IRushd = startRushd();
      const socketPath: string = await readReadyLineAsync(started);
      expect(getDaemonFiles(socketPath)).toEqual({ socket: true, lockfile: true });

      started.process.stderr?.destroy();
      started.process.kill(signal);

      // The shutdown line, which goes to stderr, used to end the process with an unhandled EPIPE.
      const exit: IProcessExit = await started.exited;
      expect({ ...exit, ...getDaemonFiles(socketPath) }).toEqual({
        code: 0,
        signal: undefined,
        socket: false,
        lockfile: false
      });
    },
    30000
  );

  it('keeps running when nothing reads its stdout, and then stops cleanly', async () => {
    const started: IRushd = startRushd();
    started.process.stdout?.destroy();
    const socketPath: string = await waitForDaemonFilesAsync(started);
    await delayAsync(AFTER_READY_MS);

    // The ready line, which goes to stdout, used to end the process with an unhandled EPIPE.
    expect({ exitCode: started.process.exitCode, stderr: started.getStderr() }).toEqual({
      exitCode: null,
      stderr: ''
    });
    started.process.kill('SIGTERM');

    const exit: IProcessExit = await started.exited;
    expect({ ...exit, ...getDaemonFiles(socketPath) }).toEqual({
      code: 0,
      signal: undefined,
      socket: false,
      lockfile: false
    });
    expect(started.getStderr()).toMatch(/^\S+ rushd \(PID \d+\) shutting down: received SIGTERM\n$/);
  }, 30000);
});
