// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ChildProcess, spawn } from 'node:child_process';
import type { SpawnOptions } from 'node:child_process';
import fs from 'node:fs';
import * as path from 'node:path';

import { startOperationGroupRecording } from '../DaemonOperationGroupRecorder';
import { getOperationGroupsFolder, readFolderNames } from '../DaemonOperationGroups';
import { readProcessStat } from '../DaemonProcessStat';

import { identifyStarted, killStillRunning } from './ProcessWaitFixture';
import type { IStartedProcess } from './ProcessWaitFixture';
import { createTestDaemonPaths } from './TestDaemonFixture';

const linuxIt: jest.It = process.platform === 'linux' ? it : it.skip;
const SLEEP_ARGS: string[] = ['-e', 'setTimeout(() => {}, 30000)'];
const MARK_PREFIX: string = 'spawn-';
const MARK_PATTERN: RegExp = /^write spawn-(\d+)$/;
const TICKS_MATCH: number = 1;
const SPAWN_WINDOW_TICKS: number = 100;

type SpawnMethod = (this: ChildProcess, options: unknown) => unknown;

interface ISpawnTrace {
  readonly child: ChildProcess;
  /** The steps traced until `spawn()` returned. */
  readonly steps: string[];
  /** The spawn marks in the record folder when `spawn()` returned. */
  readonly marksLeft: string[];
}

let started: IStartedProcess[] = [];
afterEach(() => {
  killStillRunning(started);
  started = [];
  jest.restoreAllMocks();
});

// Traces the writes and removals of entries in `folder`, and every call of the ChildProcess spawn method.
function traceSpawnSteps(folder: string): string[] {
  const steps: string[] = [];
  const trace = (verb: string, file: unknown): void => {
    if (String(file).startsWith(folder)) steps.push(`${verb} ${path.basename(String(file))}`);
  };
  const { writeFileSync, rmSync } = fs;
  jest.spyOn(fs, 'writeFileSync').mockImplementation((...args: Parameters<typeof writeFileSync>) => {
    const [file] = args;
    trace('write', file);
    writeFileSync(...args);
  });
  jest.spyOn(fs, 'rmSync').mockImplementation((...args: Parameters<typeof rmSync>) => {
    const [file] = args;
    trace('remove', file);
    rmSync(...args);
  });
  const prototype: { spawn: SpawnMethod } = ChildProcess.prototype as unknown as { spawn: SpawnMethod };
  const spawnMethod: SpawnMethod = prototype.spawn;
  jest.spyOn(prototype, 'spawn').mockImplementation(function (this: ChildProcess, options: unknown) {
    steps.push('spawn');
    return spawnMethod.call(this, options);
  });
  return steps;
}

// Spawns a sleeper while recording in a new folder.
function spawnTraced(options: SpawnOptions): ISpawnTrace {
  const folder: string = getOperationGroupsFolder(createTestDaemonPaths().lockfilePath, process.pid);
  const stop: () => void = startOperationGroupRecording(folder);
  const steps: string[] = traceSpawnSteps(folder);
  const child: ChildProcess = spawn(process.execPath, SLEEP_ARGS, options);
  const traced: string[] = [...steps];
  started = identifyStarted([Number(child.pid)]);
  const marksLeft: string[] = readFolderNames(folder).filter((name: string) => name.startsWith(MARK_PREFIX));
  stop();
  return { child, steps: traced, marksLeft };
}

linuxIt('marks a detached spawn before it starts, and unmarks it only after the child is recorded', () => {
  const { child, steps, marksLeft }: ISpawnTrace = spawnTraced({ detached: true, stdio: 'ignore' });
  const start: number = Number(readProcessStat(Number(child.pid))?.startTime);
  const [firstStep] = steps;
  const mark: number = Number(MARK_PATTERN.exec(firstStep)?.[TICKS_MATCH]);
  const window: boolean[] = [mark <= start, start - mark <= SPAWN_WINDOW_TICKS];
  expect({ steps, marksLeft, window }).toEqual({
    steps: [`write ${MARK_PREFIX}${mark}`, 'spawn', `write ${child.pid}-${start}`, `remove ${MARK_PREFIX}${mark}`],
    marksLeft: [],
    window: [true, true]
  });
});

linuxIt('writes no spawn mark for a child that stays in the daemon group', () => {
  const { steps, marksLeft }: ISpawnTrace = spawnTraced({ stdio: 'ignore' });
  expect({ steps, marksLeft }).toEqual({ steps: ['spawn'], marksLeft: [] });
});
