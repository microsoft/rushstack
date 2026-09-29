// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IDaemonProcessGroupOps } from '../DaemonProcessGroup';
import type { IProcessStat } from '../DaemonProcessStat';
import type { IDaemonOrphanReaperOptions } from '../DaemonReapOptions';

import { createProcessOps, hasExited, liveProcesses } from './FakeProcessTable';
import type { IFakeProcessSpec } from './FakeProcessTable';

/** The pid of the fake dead daemon, which is also its process group id. */
export const DEAD_PID: number = 4242;
/** The fake caller's own pid (and, by default, its process group id). */
export const SELF_PID: number = 1000;
const GRACE_MS: number = 100;
const CLOCK_START: number = 0;

/** A fake process table recording every signal sent and every message logged. */
export interface IFakeGroup {
  readonly signals: NodeJS.Signals[];
  /** The group id of every signal in {@link IFakeGroup.signals}, in the same order. */
  readonly targets: number[];
  readonly logs: string[];
  readonly options: IDaemonOrphanReaperOptions;
}

/** Describes the fake process table. */
export interface IFakeGroupSpec extends IFakeProcessSpec {
  readonly daemonAlive?: boolean;
  readonly ownGroupId?: number;
  readonly unknownOwnGroup?: boolean;
  readonly anyGroupExists?: boolean;
}

interface IFakeTable extends Omit<IFakeGroup, 'options'> {
  readonly spec: IFakeGroupSpec;
}

function isKnownGroup(table: IFakeTable, groupId: number): boolean {
  return table.spec.anyGroupExists === true || groupId === DEAD_PID;
}

function groupExists(table: IFakeTable, groupId: number): boolean {
  const inTable: boolean = liveProcesses(table).some((stat: IProcessStat) => stat.groupId === groupId);
  return !hasExited(table) && (isKnownGroup(table, groupId) || inTable);
}

function createGroupOps(table: IFakeTable): IDaemonProcessGroupOps {
  const { spec } = table;
  let clock: number = CLOCK_START;
  return {
    isProcessAlive: () => spec.daemonAlive === true,
    groupExists: (groupId: number) => groupExists(table, groupId),
    mayHaveMembers: (groupId: number) => groupExists(table, groupId),
    signalGroup: (groupId: number, signal: NodeJS.Signals) => {
      table.targets.push(groupId);
      table.signals.push(signal);
    },
    ownGroupId: () => (spec.unknownOwnGroup === true ? undefined : (spec.ownGroupId ?? SELF_PID)),
    ...createProcessOps(table, DEAD_PID),
    delayAsync: async (ms: number) => {
      clock += ms;
    },
    now: () => clock,
    log: (message: string) => table.logs.push(message)
  };
}

/** Creates a fake process table with a virtual clock. */
export function createFakeGroup(spec: IFakeGroupSpec): IFakeGroup {
  const table: IFakeTable = { spec, signals: [], targets: [], logs: [] };
  const options: IDaemonOrphanReaperOptions = {
    ops: createGroupOps(table),
    platform: 'linux',
    selfPid: SELF_PID,
    graceMs: GRACE_MS
  };
  return { signals: table.signals, targets: table.targets, logs: table.logs, options };
}
