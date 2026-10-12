// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawn, type ChildProcess, type StdioOptions } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import type { Socket } from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { setTimeout as delayAsync } from 'node:timers/promises';

import { listInheritedFileDescriptors } from '../InheritedFileDescriptors';
import { removeTestFolderAsync } from './TestProcessExit';

const linuxIt: typeof it = process.platform === 'linux' ? it : it.skip;

const LINUX_O_CLOEXEC: number = 0o2000000;
// Each after a gap in the child's table, like the pipe of bash's `2> >(…)`, so Node does not mark it close-on-exec.
const CHANNEL_FD: number = 40;
const PIPE_FD: number = 63;
const FILE_FD: number = 200;

/** Whether each descriptor of a process is marked close-on-exec, from its /proc folder. */
function readCloseOnExec(pid: number): Map<number, boolean> {
  const descriptors: Map<number, boolean> = new Map();
  for (const entry of fs.readdirSync(`/proc/${pid}/fd`)) {
    let fdinfo: string;
    try {
      fdinfo = fs.readFileSync(`/proc/${pid}/fdinfo/${entry}`, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
    const flags: number = parseInt(/^flags:\s*([0-7]+)$/m.exec(fdinfo)![1], 8);
    descriptors.set(Number(entry), Math.floor(flags / LINUX_O_CLOEXEC) % 2 === 1);
  }
  return descriptors;
}

async function waitUntilAsync(condition: () => boolean, description: string): Promise<void> {
  const deadline: number = Date.now() + 5000;
  while (!condition()) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting until ${description}.`);
    await delayAsync(10);
  }
}

/** The child's next message. Fails at once if the child exits first, for example because it closed its channel. */
function receiveAsync<T>(child: ChildProcess): Promise<T> {
  return new Promise((resolve, reject) => {
    const onExit = (code: number | null, signal: NodeJS.Signals | null): void =>
      reject(new Error(`The child exited (${code ?? signal}) before it answered.`));
    child.once('exit', onExit);
    child.once('message', (message: T) => {
      child.off('exit', onExit);
      resolve(message);
    });
  });
}

describe('inherited file descriptors', () => {
  let folder: string;
  let running: { child: ChildProcess; closed: Promise<unknown[]> } | undefined;

  beforeEach(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-inherited-fds-'));
    running = undefined;
  });

  afterEach(async () => {
    if (running) {
      // Without its channel, the child has nothing left to wait for and exits.
      if (running.child.connected) running.child.disconnect();
      await running.closed;
    }
    await removeTestFolderAsync(folder);
  });

  linuxIt(
    'closes the descriptors that a started program would inherit, and keeps its own and its IPC channel',
    async () => {
      const stdio: (string | number)[] = new Array(FILE_FD + 1).fill('ignore');
      stdio[2] = 'pipe';
      stdio[CHANNEL_FD] = 'ipc';
      stdio[PIPE_FD] = 'pipe';
      const lockFd: number = fs.openSync(path.join(folder, 'lock'), 'w');
      let child: ChildProcess;
      try {
        stdio[FILE_FD] = lockFd;
        child = spawn(
          process.execPath,
          [path.join(__dirname, 'fixtures/inheritedDescriptors.js'), path.join(folder, 'own')],
          { stdio: stdio as StdioOptions }
        );
      } finally {
        fs.closeSync(lockFd);
      }
      running = { child, closed: once(child, 'close') };
      let stderr: string = '';
      child.stderr!.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      const pipe: Socket = child.stdio[PIPE_FD] as Socket;
      let pipeEnded: boolean = false;
      pipe.once('end', () => {
        pipeEnded = true;
      });
      pipe.resume();

      const { ownFd } = await receiveAsync<{ ownFd: number }>(child);
      const before: Map<number, boolean> = readCloseOnExec(child.pid!);
      expect([CHANNEL_FD, PIPE_FD, FILE_FD, ownFd].map((fd) => before.get(fd))).toEqual([
        false,
        false,
        false,
        true
      ]);

      child.send('close');
      const { closed } = await receiveAsync<{ closed: number[] }>(child);
      expect(closed).toEqual(expect.arrayContaining([PIPE_FD, FILE_FD]));
      // Nothing that was close-on-exec.
      expect(closed.filter((fd) => before.get(fd) !== false)).toEqual([]);
      const after: Map<number, boolean> = readCloseOnExec(child.pid!);
      expect([...after].filter(([fd, closeOnExec]) => fd > 2 && fd !== CHANNEL_FD && !closeOnExec)).toEqual(
        []
      );
      expect([after.has(CHANNEL_FD), after.has(ownFd)]).toEqual([true, true]);
      // The pipe's reader sees end-of-file while the child still runs.
      await waitUntilAsync(() => pipeEnded, 'the pipe ends');
      expect(child.exitCode).toBeNull();

      child.send('exit');
      const [code] = await running.closed;
      expect({ code, stderr, own: fs.readFileSync(path.join(folder, 'own'), 'utf8') }).toEqual({
        code: 0,
        stderr: '',
        own: 'still open'
      });
    },
    20000
  );

  describe('in this process', () => {
    const platform: PropertyDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')!;
    const channel: PropertyDescriptor | undefined = Object.getOwnPropertyDescriptor(process, 'channel');

    beforeEach(() => {
      // Jest gives the tests a copy of the process, whose copy of the IPC channel cannot report its descriptor.
      Object.defineProperty(process, 'channel', { value: undefined, configurable: true });
    });

    afterEach(() => {
      jest.restoreAllMocks();
      Object.defineProperty(process, 'platform', platform);
      if (channel) {
        Object.defineProperty(process, 'channel', channel);
      } else {
        delete (process as { channel?: unknown }).channel;
      }
    });

    linuxIt('lists them where /proc/self/fdinfo reports close-on-exec, as Linux does', () => {
      expect(listInheritedFileDescriptors()).toEqual(expect.any(Array));
    });

    it('lists nothing on a platform other than Linux', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
      const openSync: jest.SpyInstance = jest.spyOn(fs, 'openSync');
      expect(listInheritedFileDescriptors()).toBeUndefined();
      expect(openSync).not.toHaveBeenCalled();
    });

    // Where /proc is missing or reports something else, it would otherwise close descriptors that Node uses.
    const fdinfoReaders: [string, (fdinfoPath: string) => string][] = [
      ['has no close-on-exec flag for a descriptor that Node opened', () => 'pos:\t0\nflags:\t0100002\n'],
      ['has no flags', () => 'pos:\t0\n'],
      [
        'is missing',
        (fdinfoPath: string) => {
          throw Object.assign(new Error(`ENOENT: no such file or directory, open '${fdinfoPath}'`), {
            code: 'ENOENT'
          });
        }
      ]
    ];
    linuxIt.each(fdinfoReaders)('lists nothing when /proc/self/fdinfo %s', (kind, readFdinfo) => {
      const readFileSync: typeof fs.readFileSync = fs.readFileSync;
      jest
        .spyOn(fs, 'readFileSync')
        .mockImplementation(((filePath: string, options: BufferEncoding) =>
          String(filePath).startsWith('/proc/self/fdinfo/')
            ? readFdinfo(String(filePath))
            : readFileSync(filePath, options)) as typeof fs.readFileSync);
      expect(listInheritedFileDescriptors()).toBeUndefined();
    });
  });
});
