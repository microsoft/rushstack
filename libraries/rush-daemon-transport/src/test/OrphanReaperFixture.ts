// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IDaemonOrphanReaperOptions } from '../DaemonOrphanReaper';
import type { IDaemonProcessGroupOps } from '../DaemonProcessGroup';

/** The pid of the fake dead daemon, which is also its process group id. */
export const DEAD_PID: number = 4242;
/** The fake caller's own pid (and, by default, its process group id). */
export const SELF_PID: number = 1000;
const GRACE_MS: number = 100;
const CLOCK_START: number = 0;

/** A fake process table recording every signal sent and every message logged. */
export interface IFakeGroup {
  readonly signals: NodeJS.Signals[];
  readonly logs: string[];
  readonly options: IDaemonOrphanReaperOptions;
}

/** Describes the fake process table. */
export interface IFakeGroupSpec {
  readonly daemonAlive?: boolean;
  /** The signal after which the group is gone; omitted means it never exits. */
  readonly exitsOn?: NodeJS.Signals;
  readonly ownGroupId?: number;
  readonly unknownOwnGroup?: boolean;
  readonly anyGroupExists?: boolean;
}

/** Creates a fake process table with a virtual clock. */
export function createFakeGroup(spec: IFakeGroupSpec): IFakeGroup {
  const signals: NodeJS.Signals[] = [];
  const logs: string[] = [];
  let clock: number = CLOCK_START;
  const ops: IDaemonProcessGroupOps = {
    isProcessAlive: () => spec.daemonAlive === true,
    groupExists: (groupId: number) =>
      (spec.anyGroupExists === true || groupId === DEAD_PID) &&
      !signals.some((signal: NodeJS.Signals) => signal === spec.exitsOn),
    signalGroup: (groupId: number, signal: NodeJS.Signals) => signals.push(signal),
    ownGroupId: () => (spec.unknownOwnGroup === true ? undefined : (spec.ownGroupId ?? SELF_PID)),
    delayAsync: async (ms: number) => {
      clock += ms;
    },
    now: () => clock,
    log: (message: string) => logs.push(message)
  };
  return { signals, logs, options: { ops, platform: 'linux', selfPid: SELF_PID, graceMs: GRACE_MS } };
}
