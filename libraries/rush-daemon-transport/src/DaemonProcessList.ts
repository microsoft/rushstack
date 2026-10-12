// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';

import { isLiveMemberOf, readProcessStat } from './DaemonProcessStat';
import type { IProcessStat } from './DaemonProcessStat';

const PROC_ROOT: string = '/proc';
const PID_PATTERN: RegExp = /^\d+$/;

/** Lists the pids in `/proc`; throws when `/proc` cannot be listed. */
export function readProcessIds(): number[] {
  return fs
    .readdirSync(PROC_ROOT)
    .filter((name: string) => PID_PATTERN.test(name))
    .map(Number);
}

function listProcessIds(): number[] {
  try {
    return readProcessIds();
  } catch {
    return [];
  }
}

function isReadable(stat: IProcessStat | undefined): stat is IProcessStat {
  return stat !== undefined;
}

/** Reads the `/proc` record of every process, zombies included; none when `/proc` cannot be listed. */
export function listProcesses(): IProcessStat[] {
  return listProcessIds().map(readProcessStat).filter(isReadable);
}

/** Lists the processes of group `groupId` that have not exited, by scanning `/proc`. */
export function listLiveGroupMembers(groupId: number): IProcessStat[] {
  return listProcessIds()
    .map(readProcessStat)
    .filter((stat: IProcessStat | undefined): stat is IProcessStat => isLiveMemberOf(groupId, stat));
}
