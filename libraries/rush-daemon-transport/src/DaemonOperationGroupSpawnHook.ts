// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ChildProcess } from 'node:child_process';

import { withSpawnMark } from './DaemonOperationGroupSpawnMark';

const SPAWN_METHOD: string = 'spawn';
const SPAWN_EVENT: string = 'spawn';

/** The record folder in which a spawn in flight is marked, and how to record the child once it has a pid. */
export interface ISpawnRecording {
  readonly folder: string;
  readonly record: () => void;
}

interface ISpawnOptions {
  readonly detached?: unknown;
}

// Node's spawn functions construct the ChildProcess, which publishes it, and then call `child.spawn(options)`,
// which starts the process and sets `child.pid`. An own property of the instance runs instead of the prototype's
// method, once: it removes itself first.
function hookSpawnMethod(child: ChildProcess, { folder, record }: ISpawnRecording): void {
  const spawnMethod: unknown = Reflect.get(child, SPAWN_METHOD);
  if (typeof spawnMethod !== 'function') return;
  const spawnAndRecord = (options: ISpawnOptions | undefined): unknown => {
    Reflect.deleteProperty(child, SPAWN_METHOD);
    return withSpawnMark(folder, options?.detached === true, () => {
      const result: unknown = Reflect.apply(spawnMethod, child, [options]);
      record();
      return result;
    });
  };
  Reflect.defineProperty(child, SPAWN_METHOD, { configurable: true, writable: true, value: spawnAndRecord });
}

// A lost record only means that the child is not reaped if this process dies uncleanly. A throw would instead
// reach whoever called Node's spawn function, after the child had started, or leave the 'spawn' listener.
function tryRecord(recording: Pick<ISpawnRecording, 'record'>): void {
  try {
    recording.record();
  } catch {
    // See above.
  }
}

/**
 * Calls `record` once for `child`, which was just published on the `child_process` channel: right after Node
 * has started it, before any other code can run, or else on its `'spawn'` event, one tick later. A throw from
 * `record` is dropped.
 */
export function recordOnSpawn(child: ChildProcess, recording: ISpawnRecording): void {
  let recorded: boolean = false;
  const recordOnce = (): void => {
    if (recorded) return;
    recorded = true;
    tryRecord(recording);
  };
  hookSpawnMethod(child, { folder: recording.folder, record: recordOnce });
  child.once(SPAWN_EVENT, recordOnce);
}
