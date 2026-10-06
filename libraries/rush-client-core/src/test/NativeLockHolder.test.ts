// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { findNativeLockHolder, formatNativeLockCommand, formatNativeLockHolder } from '../NativeLockHolder';
import { tryGetProcessState } from '../ProcessStartTime';

// The tests start Node.js processes, which can take longer than Jest's default 5 seconds on a busy machine.
jest.setTimeout(30_000);

const linuxIt: typeof it = process.platform === 'linux' ? it : it.skip;
const TEST_FOLDER: string = path.resolve(__dirname, '../../temp/test/native-lock-holder');
const HOUR_MS: number = 60 * 60 * 1000;
/** No process has this PID: Linux gives PIDs below 4194304, the most that pid_max can be. */
const NO_SUCH_PID: number = 4194304;

function createLockFolder(name: string): string {
  const folder: string = path.join(TEST_FOLDER, name);
  fs.rmSync(folder, { recursive: true, force: true });
  fs.mkdirSync(folder, { recursive: true });
  return folder;
}

/** Writes a lock file as LockFile.acquire does, with its owner's start time, and dates it `ageMs` back. */
function writeLockFile(
  folder: string,
  pid: number,
  ageMs: number = 0,
  content: string = 'start time',
  resourceName: string = 'rush'
): void {
  const filePath: string = path.join(folder, `${resourceName}#${pid}.lock`);
  fs.writeFileSync(filePath, content);
  const time: Date = new Date(Date.now() - ageMs);
  fs.utimesSync(filePath, time, time);
}

/** Says that it runs, then runs until its stdin ends. */
const PROGRAM_SCRIPT: string =
  "process.stdout.write('started');process.stdin.resume();process.stdin.on('end',()=>process.exit(0));";

/** Starts `node <args>` to run {@link PROGRAM_SCRIPT}, and waits until it runs. */
async function startNodeAsync(args: string[]): Promise<ChildProcess> {
  const child: ChildProcess = spawn(process.execPath, args, { stdio: ['pipe', 'pipe', 'ignore'] });
  await once(child, 'spawn');
  // Just after the spawn event, the process can still be in exec, before /proc shows its command line.
  // A process that exits before it runs fails the test at once, not at the test's timeout.
  const ran: boolean = await Promise.race([
    once(child.stdout!, 'data').then(() => true),
    once(child, 'exit').then(() => false)
  ]);
  if (!ran) {
    throw new Error(
      `node ${args.join(' ')} exited before it ran (exit code ${child.exitCode}, signal ${child.signalCode})`
    );
  }
  return child;
}

/** Starts a process that looks like `<program> <args>` to /proc, and runs until its stdin ends. */
async function startProgramAsync(folder: string, program: string, args: string[]): Promise<ChildProcess> {
  const script: string = path.join(folder, program);
  fs.writeFileSync(script, PROGRAM_SCRIPT);
  return await startNodeAsync([script, ...args]);
}

async function stopProgramAsync(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const closed: Promise<unknown[]> = once(child, 'close');
  child.stdin!.end();
  await closed;
}

/** Waits until the state of `pid` in /proc satisfies `isExpected`. */
async function waitForStateAsync(
  pid: number,
  isExpected: (code: string | undefined) => boolean
): Promise<void> {
  const deadline: number = Date.now() + 5000;
  while (!isExpected(tryGetProcessState(pid)?.code)) {
    if (Date.now() > deadline) throw new Error(`PID ${pid} stayed in state ${tryGetProcessState(pid)?.code}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function getExitedPidAsync(): Promise<number> {
  const exited: ChildProcess = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' });
  await once(exited, 'close');
  return exited.pid!;
}

describe(formatNativeLockHolder.name, () => {
  it.each([
    [
      { pid: NO_SUCH_PID, command: 'rush install' },
      `another Rush process (PID ${NO_SUCH_PID}: rush install)`
    ],
    [{ pid: NO_SUCH_PID }, `another Rush process (PID ${NO_SUCH_PID})`],
    [{ command: 'rush install' }, 'another Rush process (rush install)'],
    [{}, 'another Rush process'],
    [undefined, 'another Rush process']
  ])('names %j as %j', (holder, expected) => {
    expect(formatNativeLockHolder(holder)).toBe(expected);
  });

  linuxIt(
    'says that the process is stopped for as long as it is, since it cannot release the lock',
    async () => {
      const folder: string = createLockFolder('stopped');
      const holder: ChildProcess = await startProgramAsync(folder, 'rush', ['install']);
      const pid: number = holder.pid!;
      try {
        holder.kill('SIGSTOP');
        await waitForStateAsync(pid, (code) => code === 'T');
        expect(formatNativeLockHolder({ pid, command: 'rush install' })).toBe(
          `another Rush process (PID ${pid}: rush install; it is stopped (state T), for example by SIGSTOP)`
        );
        expect(formatNativeLockHolder({ pid })).toBe(
          `another Rush process (PID ${pid}; it is stopped (state T), for example by SIGSTOP)`
        );

        holder.kill('SIGCONT');
        await waitForStateAsync(pid, (code) => code !== 'T');
        expect(formatNativeLockHolder({ pid, command: 'rush install' })).toBe(
          `another Rush process (PID ${pid}: rush install)`
        );
      } finally {
        holder.kill('SIGCONT');
        await stopProgramAsync(holder);
      }
    }
  );
});

describe(formatNativeLockCommand.name, () => {
  it.each([
    [
      ['node', '/home/u/.rush/node_modules/@microsoft/rush/bin/rush', 'install', '--bypass-policy'],
      'rush install'
    ],
    [
      ['/usr/bin/node', '/repo/common/scripts/install-run-rush.js', '--debug', 'build'],
      'install-run-rush build'
    ],
    [['node', '/opt/rush-client', '--wait-timeout', '30', 'build'], 'rush-client'],
    [['node', '/repo/node_modules/.bin/rushx'], 'rushx'],
    [['node', '/repo/rush', 'publish:beta'], 'rush publish:beta'],
    [['node', '-e', 'require("x")'], undefined],
    [['node'], undefined],
    [['node', '/weird path/rush (copy)', 'build'], undefined]
  ])('shortens %j to %j', (argv: string[], expected: string | undefined) => {
    expect(formatNativeLockCommand(argv)).toBe(expected);
  });

  it('keeps no argument after the action, which could hold a secret', () => {
    expect(formatNativeLockCommand(['node', '/repo/rush', 'publish', '--npm-auth-token', 'secret'])).toBe(
      'rush publish'
    );
  });
});

describe(findNativeLockHolder.name, () => {
  const children: ChildProcess[] = [];

  afterEach(async () => {
    await Promise.all(children.splice(0).map(stopProgramAsync));
  });

  linuxIt('names the live process with the oldest lock file, and its command', async () => {
    const folder: string = createLockFolder('holder');
    const holder: ChildProcess = await startProgramAsync(folder, 'rush', ['install', '--bypass-policy']);
    const contender: ChildProcess = await startProgramAsync(folder, 'rush.js', ['build']);
    children.push(holder, contender);
    // An older lock file of an exited process is stale, and the daemon's own lock file is its own.
    writeLockFile(folder, await getExitedPidAsync(), 3000);
    writeLockFile(folder, process.pid, 2000);
    writeLockFile(folder, holder.pid!, 1000);
    writeLockFile(folder, contender.pid!, 0);
    // PID 1 runs, and began long ago, but its lock file is for another resource.
    writeLockFile(folder, 1, 4000, 'start time', 'other');

    expect(findNativeLockHolder(folder)).toEqual({ pid: holder.pid, command: 'rush install' });
  });

  linuxIt(
    'skips a lock file whose PID now belongs to a process that started after it was written',
    async () => {
      const folder: string = createLockFolder('reused-pid');
      const reused: ChildProcess = await startProgramAsync(folder, 'rush', ['build']);
      const holder: ChildProcess = await startProgramAsync(folder, 'rush', ['update']);
      children.push(reused, holder);
      writeLockFile(folder, reused.pid!, HOUR_MS);
      writeLockFile(folder, holder.pid!, 0);

      expect(findNativeLockHolder(folder)).toEqual({ pid: holder.pid, command: 'rush update' });
    }
  );

  linuxIt(
    'skips an empty lock file, which a process writes before it knows whether it acquired the lock',
    async () => {
      const folder: string = createLockFolder('empty');
      const contender: ChildProcess = await startProgramAsync(folder, 'rush', ['build']);
      children.push(contender);
      writeLockFile(folder, contender.pid!, 0, '');

      expect(findNativeLockHolder(folder)).toEqual({});
    }
  );

  linuxIt('names only the PID of a holder whose command it cannot shorten', async () => {
    const folder: string = createLockFolder('no-command');
    const holder: ChildProcess = await startNodeAsync(['-e', PROGRAM_SCRIPT]);
    children.push(holder);
    writeLockFile(folder, holder.pid!);

    expect(findNativeLockHolder(folder)).toEqual({ pid: holder.pid });
  });

  it('names no holder when the folder has no live lock file, or cannot be read', async () => {
    const folder: string = createLockFolder('none');
    writeLockFile(folder, await getExitedPidAsync());

    expect(findNativeLockHolder(folder)).toEqual({});
    expect(findNativeLockHolder(path.join(folder, 'missing'))).toEqual({});
  });
});
