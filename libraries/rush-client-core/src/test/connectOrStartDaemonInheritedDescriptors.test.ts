// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawn, type ChildProcess, type StdioOptions } from 'node:child_process';
import { once } from 'node:events';
import * as fs from 'node:fs';
import type { Socket } from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { setTimeout as delayAsync } from 'node:timers/promises';

import type { IDaemonPaths } from '@rushstack/rush-daemon-transport';

import { captureDaemonRequest } from '../captureDaemonRequest';
import type { IConnectOrStartDaemonOptions } from '../connectOrStartDaemon';
import { removeTestFolderAsync, waitForTestProcessExitAsync } from './TestProcessExit';

const linuxIt: typeof it = process.platform === 'linux' ? it : it.skip;

// Where bash puts the pipe of `2> >(…)`, and where a script might open its lock file (`exec 200>lockfile`).
const PIPE_FD: number = 63;
const FILE_FD: number = 200;

function readIfPresent(filePath: string): string {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
}

async function waitUntilAsync(condition: () => boolean, description: string): Promise<void> {
  const deadline: number = Date.now() + 5000;
  while (!condition()) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting until ${description}.`);
    await delayAsync(10);
  }
}

describe('detached daemon startup from a client that inherited descriptors without close-on-exec', () => {
  let folder: string;
  let options: IConnectOrStartDaemonOptions;
  let starter: { exited: Promise<unknown[]>; pipe: Socket } | undefined;

  beforeEach(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-inherited-'));
    const paths: IDaemonPaths = {
      runtimeDir: folder,
      socketPath: path.join(folder, 'd.sock'),
      lockfilePath: path.join(folder, 'daemon.pid.json')
    };
    const environment = captureDaemonRequest({
      argv: [],
      commandName: 'test',
      commandOrigin: 'custom',
      cwd: folder,
      environment: { PATH: process.env.PATH },
      terminal: { isTTY: false, supportsColor: false }
    }).environment;
    options = {
      paths,
      expectedDaemonVersion: 'fixture',
      startupTimeoutMs: 7000,
      startCommand: {
        command: process.execPath,
        args: [path.join(__dirname, 'fixtures/daemon.js'), JSON.stringify(paths)],
        cwd: folder,
        environment
      }
    };
    starter = undefined;
  });

  afterEach(async () => {
    if (starter) {
      await starter.exited;
      starter.pipe.destroy();
    }
    if (fs.existsSync(path.join(folder, 'starts'))) {
      fs.writeFileSync(path.join(folder, 'stop'), '');
      const pids: string[] = fs.readFileSync(path.join(folder, 'starts'), 'utf8').trim().split('\n');
      await Promise.all(pids.map((pid) => waitForTestProcessExitAsync(Number(pid))));
      expect(pids.every((pid) => fs.existsSync(path.join(folder, `stopped-${pid}`)))).toBe(true);
    }
    expect(readIfPresent(path.join(folder, 'failures'))).toBe('');
    if (fs.existsSync(path.join(folder, 'parents'))) {
      const parents = new Set(fs.readFileSync(path.join(folder, 'parents'), 'utf8').trim().split('\n'));
      await Promise.all([...parents].map((pid) => waitForTestProcessExitAsync(Number(pid))));
    }
    await removeTestFolderAsync(folder);
  }, 15000);

  linuxIt(
    'starts a daemon that holds neither a pipe nor a file of the client, so the pipe ends with the client',
    async () => {
      const stdio: (string | number)[] = new Array(FILE_FD + 1).fill('ignore');
      stdio[2] = 'pipe';
      stdio[PIPE_FD] = 'pipe';
      const lockFd: number = fs.openSync(path.join(folder, 'lock'), 'w');
      let child: ChildProcess;
      try {
        stdio[FILE_FD] = lockFd;
        child = spawn(
          process.execPath,
          [path.join(__dirname, 'fixtures/starter.js'), JSON.stringify(options)],
          { stdio: stdio as StdioOptions }
        );
      } finally {
        fs.closeSync(lockFd);
      }
      const pipe: Socket = child.stdio[PIPE_FD] as Socket;
      starter = { exited: once(child, 'exit'), pipe };
      let pipeEnded: boolean = false;
      pipe.once('end', () => {
        pipeEnded = true;
      });
      pipe.resume();
      let stderr: string = '';
      child.stderr!.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      const stderrEnded: Promise<unknown[]> = once(child.stderr!, 'end');

      const [code] = await starter.exited;
      await stderrEnded;
      expect({ code, stderr }).toEqual({ code: 0, stderr: '' });
      const daemonPid: number = Number(fs.readFileSync(path.join(folder, 'starts'), 'utf8'));
      const daemonFds: string[] = fs.readdirSync(`/proc/${daemonPid}/fd`);
      expect(daemonFds).toContain('1');
      expect(daemonFds.filter((fd) => fd === String(PIPE_FD) || fd === String(FILE_FD))).toEqual([]);
      // Its reader sees end-of-file while the daemon still runs.
      await waitUntilAsync(() => pipeEnded, 'the pipe ends');
      expect(fs.existsSync(path.join(folder, `stopped-${daemonPid}`))).toBe(false);
    },
    30000
  );
});
