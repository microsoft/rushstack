// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';

import { readFolderNames } from '../DaemonOperationGroups';
import { recordOnSpawn } from '../DaemonOperationGroupSpawnHook';

const MARK_PREFIX: string = 'spawn-';
const SPAWN_METHOD: string = 'spawn';
const DETACHED: Readonly<Record<string, boolean>> = { detached: true };

/** What the stand-in's own `spawn` returns, unless a test says otherwise. */
export const SPAWNED: Readonly<Record<string, boolean>> = { spawned: true };

/** What the stand-in's own `spawn` does, called on the stand-in `child`. */
export type StandInSpawn = (child: EventEmitter) => unknown;

/** What a detached spawn of a stand-in child through the recorder's hook did. */
export interface IStandInRun {
  readonly child: EventEmitter;
  /** What the hooked `spawn` returned to its caller, as Node's spawn functions would get it. */
  readonly returned?: unknown;
  /** What the hooked `spawn` threw. */
  readonly thrown?: unknown;
  /** The calls of the stand-in's own `spawn`. */
  readonly spawnCalls: number;
  readonly recordCalls: number;
  /** The spawn marks in the folder while the stand-in's own `spawn` ran. */
  readonly marksInSpawn: string[];
  /** The spawn marks in the folder after the hooked `spawn` returned or threw. */
  readonly marksAfter: string[];
}

/** The record folder, what the stand-in's own `spawn` does, and what recording the child does. */
export interface IStandInOptions {
  readonly folder: string;
  readonly spawn?: StandInSpawn;
  readonly record?: () => void;
}

function readMarks(folder: string): string[] {
  return readFolderNames(folder).filter((name: string) => name.startsWith(MARK_PREFIX));
}

// An instance of a new class whose prototype's `spawn` is `spawn`, as ChildProcess's prototype has Node's.
function createStandIn(spawn: jest.Mock): EventEmitter {
  class StandInChild extends EventEmitter {}
  Reflect.defineProperty(StandInChild.prototype, SPAWN_METHOD, {
    configurable: true,
    writable: true,
    value: spawn
  });
  return new StandInChild();
}

function callSpawn(child: EventEmitter): Pick<IStandInRun, 'returned' | 'thrown'> {
  try {
    return { returned: Reflect.apply(Reflect.get(child, SPAWN_METHOD), child, [DETACHED]) };
  } catch (error) {
    return { thrown: error };
  }
}

/**
 * Hooks a stand-in child the way the recorder hooks each published ChildProcess, and then calls its `spawn` for a
 * detached child, the way Node's spawn functions do. No process is started.
 */
export function spawnStandIn({
  folder,
  spawn = () => SPAWNED,
  record = () => undefined
}: IStandInOptions): IStandInRun {
  const marksInSpawn: string[] = [];
  const ownSpawn: jest.Mock = jest.fn(function (this: EventEmitter): unknown {
    marksInSpawn.push(...readMarks(folder));
    return spawn(this);
  });
  const recordMock: jest.Mock = jest.fn(record);
  const child: EventEmitter = createStandIn(ownSpawn);
  recordOnSpawn(child as unknown as ChildProcess, { folder, record: recordMock });
  const result: Pick<IStandInRun, 'returned' | 'thrown'> = callSpawn(child);
  return {
    child,
    ...result,
    spawnCalls: ownSpawn.mock.calls.length,
    recordCalls: recordMock.mock.calls.length,
    marksInSpawn,
    marksAfter: readMarks(folder)
  };
}
