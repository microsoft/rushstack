// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IDaemonProcessGroupOps } from './DaemonProcessGroup';
import type { IReapContext } from './DaemonReapOptions';

interface IKeptRead<T> {
  readonly value: T;
}

// A read that throws is not kept, so the next caller reads again and gets its own error.
function readOnce<T>(read: (id: number) => T): (id: number) => T {
  const kept: Map<number, IKeptRead<T>> = new Map();
  return (id: number): T => {
    const result: IKeptRead<T> = kept.get(id) ?? { value: read(id) };
    kept.set(id, result);
    return result.value;
  };
}

/**
 * `context`, with each process's `/proc` record and each group's list of live members read at most once.
 *
 * @remarks
 * The proof and the report of one reap share it: the report judges a group on what the proof read of it, and
 * scans every process's record only for a group that the proof did not read. Whether a group has any process
 * at all (`mayHaveMembers`) is still asked each time.
 */
export function withProcessReadsOnce(context: IReapContext): IReapContext {
  const { ops } = context;
  const readsOnce: IDaemonProcessGroupOps = {
    ...ops,
    readProcessStat: readOnce(ops.readProcessStat),
    listLiveGroupMembers: readOnce(ops.listLiveGroupMembers)
  };
  return { ...context, ops: readsOnce };
}
