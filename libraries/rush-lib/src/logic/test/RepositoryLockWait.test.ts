// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';

import { FileSystem, type LockFile } from '@rushstack/node-core-library';
import { StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';

import { EnvironmentVariableNames } from '../../api/EnvironmentConfiguration';
import {
  acquireRepositoryLockAsync,
  consumeRepositoryLockWait,
  describeRepositoryLockHolder,
  type IRepositoryLockResult,
  type IRepositoryLockWait
} from '../RepositoryLockWait';

const TEMP_FOLDER: string = path.resolve(__dirname, '../../../temp/test/RepositoryLockWait');
const DEADLINE: string = EnvironmentVariableNames._RUSH_LOCK_WAIT_DEADLINE;
const DAEMON_PID: string = EnvironmentVariableNames._RUSH_LOCK_WAIT_DAEMON_PID;
const OWN_PID: number = 100;
const DAEMON: number = 4242;
const HELD_LOCK: LockFile = { release: () => undefined } as unknown as LockFile;

function writeLockFile(folder: string, name: string, content: string, writtenAtSeconds: number): void {
  const filePath: string = path.join(folder, name);
  FileSystem.writeFile(filePath, content, { ensureFolderExists: true });
  fs.utimesSync(filePath, writtenAtSeconds, writtenAtSeconds);
}

function createLockFolder(name: string): string {
  const folder: string = path.join(TEMP_FOLDER, name);
  FileSystem.ensureEmptyFolder(folder);
  return folder;
}

describe(consumeRepositoryLockWait.name, () => {
  it('returns undefined when rush-client asked for no wait', () => {
    const environment: NodeJS.ProcessEnv = { PATH: '/bin' };
    expect(consumeRepositoryLockWait(environment)).toBeUndefined();
    expect(environment).toEqual({ PATH: '/bin' });
  });

  it('reads the deadline and the daemon PID, and removes both variables', () => {
    const environment: NodeJS.ProcessEnv = { PATH: '/bin', [DEADLINE]: '1700000030000', [DAEMON_PID]: '4242' };
    expect(consumeRepositoryLockWait(environment)).toEqual({ deadlineMs: 1700000030000, daemonPid: 4242 });
    expect(environment).toEqual({ PATH: '/bin' });
  });

  it('reads a deadline without a daemon PID', () => {
    const environment: NodeJS.ProcessEnv = { [DEADLINE]: '0' };
    expect(consumeRepositoryLockWait(environment)).toEqual({ deadlineMs: 0 });
    expect(environment).toEqual({});
  });

  it.each(['', 'soon', '-1', '1.5', '1e12', ' 17', '1234567890123456'])(
    'ignores the deadline %p, and still removes both variables',
    (deadline: string) => {
      const environment: NodeJS.ProcessEnv = { [DEADLINE]: deadline, [DAEMON_PID]: '4242' };
      expect(consumeRepositoryLockWait(environment)).toBeUndefined();
      expect(environment).toEqual({});
    }
  );

  it.each(['0', 'daemon', '-4242', '42.5'])('drops the daemon PID %p', (daemonPid: string) => {
    const environment: NodeJS.ProcessEnv = { [DEADLINE]: '5000', [DAEMON_PID]: daemonPid };
    expect(consumeRepositoryLockWait(environment)).toEqual({ deadlineMs: 5000 });
    expect(environment).toEqual({});
  });
});

describe(describeRepositoryLockHolder.name, () => {
  it('names the daemon when its lock file holds the lock', () => {
    const folder: string = createLockFolder('daemon');
    writeLockFile(folder, `rush#${DAEMON}.lock`, 'start time', 1000);
    expect(describeRepositoryLockHolder(folder, DAEMON, OWN_PID)).toBe('the Rush daemon (PID 4242)');
  });

  it('names another process when the daemon does not hold the lock', () => {
    const folder: string = createLockFolder('other');
    writeLockFile(folder, 'rush#17.lock', 'start time', 1000);
    expect(describeRepositoryLockHolder(folder, DAEMON, OWN_PID)).toBe('another Rush process (PID 17)');
    expect(describeRepositoryLockHolder(folder, undefined, OWN_PID)).toBe('another Rush process (PID 17)');
  });

  it('names the process with the oldest lock file, and ignores empty files, its own, and other locks', () => {
    const folder: string = createLockFolder('several');
    writeLockFile(folder, `rush#${OWN_PID}.lock`, 'start time', 500);
    writeLockFile(folder, 'rush#20.lock', '', 600);
    writeLockFile(folder, 'autoinstaller#21.lock', 'start time', 700);
    writeLockFile(folder, 'rush#22.lock', 'start time', 2000);
    writeLockFile(folder, `rush#${DAEMON}.lock`, 'start time', 1000);
    writeLockFile(folder, 'rush.lock', 'start time', 400);
    expect(describeRepositoryLockHolder(folder, DAEMON, OWN_PID)).toBe('the Rush daemon (PID 4242)');
  });

  it('names no PID when no lock file names the holder', () => {
    const folder: string = createLockFolder('windows');
    writeLockFile(folder, 'rush.lock', '', 1000);
    expect(describeRepositoryLockHolder(folder, DAEMON, OWN_PID)).toBe('another Rush process');
    expect(describeRepositoryLockHolder(path.join(folder, 'missing'), DAEMON, OWN_PID)).toBe(
      'another Rush process'
    );
  });
});

describe(acquireRepositoryLockAsync.name, () => {
  interface IAttempt {
    readonly result: IRepositoryLockResult;
    readonly attempts: number;
    readonly sleeps: number[];
    readonly warnings: string;
  }

  // Far more than any wait below needs; the longest takes 14 attempts.
  const MAX_ATTEMPTS: number = 1000;

  let folder: string;

  beforeAll(() => {
    folder = createLockFolder('acquire');
    writeLockFile(folder, `rush#${DAEMON}.lock`, 'start time', 1000);
  });

  /** Tries to take the lock with a clock that starts at 0 and that only sleeping advances. */
  async function acquireAsync(
    wait: IRepositoryLockWait | undefined,
    freeAfterAttempts: number = Infinity
  ): Promise<IAttempt> {
    let nowMs: number = 0;
    let attempts: number = 0;
    const sleeps: number[] = [];
    const terminalProvider: StringBufferTerminalProvider = new StringBufferTerminalProvider();
    const result: IRepositoryLockResult = await acquireRepositoryLockAsync({
      lockFolder: folder,
      wait,
      terminal: new Terminal(terminalProvider),
      tryAcquire: (lockFolder: string) => {
        expect(lockFolder).toBe(folder);
        // The fake sleep never yields to a timer, so a wait that never ended would hang Jest instead of failing.
        if (++attempts > MAX_ATTEMPTS) {
          throw new Error(`tryAcquire was called ${attempts} times`);
        }
        return attempts > freeAfterAttempts ? HELD_LOCK : undefined;
      },
      now: () => nowMs,
      sleepAsync: async (ms: number) => {
        sleeps.push(ms);
        nowMs += ms;
      },
      ownPid: OWN_PID
    });
    return { result, attempts, sleeps, warnings: terminalProvider.getWarningOutput() };
  }

  it('tries once without a wait', async () => {
    expect(await acquireAsync(undefined)).toEqual({
      result: { lock: undefined },
      attempts: 1,
      sleeps: [],
      warnings: ''
    });
    expect(await acquireAsync(undefined, 0)).toEqual({
      result: { lock: HELD_LOCK },
      attempts: 1,
      sleeps: [],
      warnings: ''
    });
  });

  it('does not wait when the lock is free', async () => {
    expect(await acquireAsync({ deadlineMs: 30000, daemonPid: DAEMON }, 0)).toEqual({
      result: { lock: HELD_LOCK },
      attempts: 1,
      sleeps: [],
      warnings: ''
    });
  });

  it('tries once and names the holder when the deadline has passed', async () => {
    expect(await acquireAsync({ deadlineMs: 0, daemonPid: DAEMON })).toEqual({
      result: {
        lock: undefined,
        holderSentence: "The Rush daemon (PID 4242) holds this repository's lock."
      },
      attempts: 1,
      sleeps: [],
      warnings: ''
    });
  });

  it('waits until the holder releases the lock', async () => {
    const { result, attempts, sleeps, warnings } = await acquireAsync({ deadlineMs: 30000, daemonPid: DAEMON }, 3);
    expect(result).toEqual({ lock: HELD_LOCK });
    expect(attempts).toBe(4);
    expect(sleeps).toEqual([100, 100, 100]);
    expect(warnings).toBe(
      "Waiting up to 30 s for the Rush daemon (PID 4242) to release this repository's lock.[n]"
    );
  });

  it('stops at the deadline and says that the holder still holds the lock', async () => {
    const { result, attempts, sleeps, warnings } = await acquireAsync({ deadlineMs: 1250, daemonPid: 17 });
    expect(result).toEqual({
      lock: undefined,
      holderSentence: "Another Rush process (PID 4242) still holds this repository's lock."
    });
    expect(attempts).toBe(14);
    expect(sleeps).toEqual([...Array(12).fill(100), 50]);
    expect(warnings).toBe(
      "Waiting up to 2 s for another Rush process (PID 4242) to release this repository's lock.[n]"
    );
  });

  it('passes on an error from an attempt', async () => {
    const error: Error = new Error('EACCES');
    await expect(
      acquireRepositoryLockAsync({
        lockFolder: folder,
        wait: { deadlineMs: Date.now() + 30000 },
        terminal: new Terminal(new StringBufferTerminalProvider()),
        tryAcquire: () => {
          throw error;
        }
      })
    ).rejects.toBe(error);
  });
});
