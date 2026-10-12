// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { once } from 'node:events';
import type { EventEmitter } from 'node:events';
import fs from 'node:fs';

import { SPAWNED, spawnStandIn } from './SpawnStandInFixture';
import type { IStandInRun } from './SpawnStandInFixture';
import { createRecordFolder, expectedSteps, stepsOf } from './SpawnStandInSteps';

const linuxIt: jest.It = process.platform === 'linux' ? it : it.skip;
// What Node's ChildProcess spawn method returns for a command that isn't found, which it reports on 'error'.
const UV_ENOENT: number = -2;
const PROC_UPTIME: string = '/proc/uptime';
const EMPTY_FILE: string = '';

afterEach(() => {
  jest.restoreAllMocks();
});

function failUptimeReads(): void {
  const { readFileSync } = fs;
  jest.spyOn(fs, 'readFileSync').mockImplementation(((...args: Parameters<typeof readFileSync>) => {
    const [file] = args;
    if (file === PROC_UPTIME) throw Object.assign(new Error(`EACCES: ${PROC_UPTIME}`), { code: 'EACCES' });
    return readFileSync(...args);
  }) as typeof readFileSync);
}

linuxIt(
  'returns what the real spawn returns, and runs it once, between writing a mark and removing it',
  () => {
    const run: IStandInRun = spawnStandIn({ folder: createRecordFolder() });
    expect(run.returned).toBe(SPAWNED);
    expect(stepsOf(run)).toEqual(expectedSteps());
  }
);

linuxIt('runs the real spawn once, and records the child, when no spawn mark can be written', () => {
  // A file where the record folder belongs, so the mark's folder can't be created.
  const folder: string = createRecordFolder();
  fs.writeFileSync(folder, EMPTY_FILE);
  expect(stepsOf(spawnStandIn({ folder }))).toEqual(expectedSteps({ marksInSpawn: [] }));
});

linuxIt(
  'runs the real spawn once, and records the child without a mark, when /proc/uptime cannot be read',
  () => {
    failUptimeReads();
    const run: IStandInRun = spawnStandIn({ folder: createRecordFolder() });
    expect(stepsOf(run)).toEqual(expectedSteps({ marksInSpawn: [] }));
  }
);

linuxIt('returns the child and removes the spawn mark when recording the child throws', () => {
  const record = (): void => {
    throw new Error('The record could not be written');
  };
  expect(stepsOf(spawnStandIn({ folder: createRecordFolder(), record }))).toEqual(expectedSteps());
});

linuxIt(
  "returns a spawn's ENOENT as the real spawn does, which reports it on 'error', and leaves no mark",
  async () => {
    const error: Error = Object.assign(new Error('spawn /nonexistent/command ENOENT'), { code: 'ENOENT' });
    const spawn = (child: EventEmitter): unknown => {
      process.nextTick(() => child.emit('error', error));
      return UV_ENOENT;
    };
    const run: IStandInRun = spawnStandIn({ folder: createRecordFolder(), spawn });
    const [emitted] = (await once(run.child, 'error')) as [unknown];
    expect(emitted).toBe(error);
    expect(stepsOf(run)).toEqual(expectedSteps({ returned: UV_ENOENT }));
  }
);

linuxIt('throws what the real spawn throws, without recording the child, and leaves no mark', () => {
  const error: Error = new Error('spawn EINVAL');
  const spawn = (): unknown => {
    throw error;
  };
  const run: IStandInRun = spawnStandIn({ folder: createRecordFolder(), spawn });
  expect(run.thrown).toBe(error);
  expect(stepsOf(run)).toEqual(expectedSteps({ returned: undefined, thrown: error, recordCalls: 0 }));
});
