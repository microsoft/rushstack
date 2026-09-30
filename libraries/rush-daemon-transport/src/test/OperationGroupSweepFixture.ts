// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';

import { getOperationGroupsFolder, writeOperationGroupRecord } from '../DaemonOperationGroups';
import type { IDaemonProcessGroupOps } from '../DaemonProcessGroup';
import type { IDaemonOrphanReaperOptions } from '../DaemonReapOptions';

import { RECORDED_START } from './OperationGroupFixture';
import type { IFakeGroup } from './OrphanReaperFixture';

/** A daemon that is gone and whose record folder no lockfile names. */
export const STRANDED_PID: number = 4301;
/** A second such daemon. */
export const OTHER_STRANDED_PID: number = 4302;
const FIRST_INDEX: number = 0;
const LINK_TARGET_SUFFIX: string = '.target';

const createdEntries: string[] = [];

/** Records `groupIds` in `folder`; {@link removeCreatedEntries} deletes what a test leaves. */
export function recordFolder(folder: string, groupIds: readonly number[]): string {
  fs.mkdirSync(folder, { recursive: true });
  for (const groupId of groupIds) writeOperationGroupRecord(folder, { groupId, startTime: RECORDED_START });
  createdEntries.push(folder);
  return folder;
}

/** Records `groupIds` in the record folder of daemon `daemonPid` beside `lockfilePath`. */
export function recordDaemonFolder(
  lockfilePath: string,
  daemonPid: number,
  groupIds: readonly number[]
): string {
  return recordFolder(getOperationGroupsFolder(lockfilePath, daemonPid), groupIds);
}

/** Moves `entryPath` aside and puts a symbolic link to it in its place. */
export function moveBehindLink(entryPath: string): void {
  const target: string = `${entryPath}${LINK_TARGET_SUFFIX}`;
  fs.renameSync(entryPath, target);
  fs.symlinkSync(target, entryPath);
  createdEntries.push(target);
}

/** Deletes the folders, links and link targets that the helpers above created. */
export function removeCreatedEntries(): void {
  for (const entry of createdEntries.splice(FIRST_INDEX)) fs.rmSync(entry, { recursive: true, force: true });
}

/** The options of `fake`, in whose process table exactly `livePids` are alive. */
export function withLivePids(fake: IFakeGroup, livePids: readonly number[]): IDaemonOrphanReaperOptions {
  const ops: IDaemonProcessGroupOps = {
    ...(fake.options.ops as IDaemonProcessGroupOps),
    isProcessAlive: (pid: number) => livePids.includes(pid)
  };
  return { ...fake.options, ops };
}
