// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { reapDeadDaemonOperationGroupsAsync } from './DaemonOperationGroupReaper';
import { listOperationGroupsDaemonPids } from './DaemonOperationGroups';
import { createReapContext } from './DaemonReapOptions';
import type { IDaemonOrphanReaperOptions, IReapContext } from './DaemonReapOptions';

// Only a folder's pid is known, not its daemon's start time, so a live process with that pid may be the
// daemon or may reuse its pid. The daemon ran as this user, so only a pid that has no process this user may
// signal proves that it is gone.
function isStranded(context: IReapContext): boolean {
  return context.deadPid !== context.selfPid && !context.ops.isProcessAlive(context.deadPid);
}

/**
 * Reaps the record folders beside `lockfilePath` that belong to daemons which are gone but which no lockfile
 * names any more, for example because an older `rush-client daemon stop --force` removed the lockfile,
 * without a reclaim, while their operations still ran.
 *
 * @remarks
 * The folders of the caller and of `ownerPid`, the daemon that the lockfile names, are skipped; the reclaim
 * reaps the owner's folder by itself. A folder whose pid has a live process stays for a later reclaim. Each
 * other folder goes through {@link reapDeadDaemonOperationGroupsAsync}: a record is signaled only with the
 * proof that it requires, unproven records are dropped without a signal, and a folder that is a symbolic link
 * or that another user owns is left alone. Call only under the reclaim mutex.
 */
export async function sweepStrandedOperationGroupsAsync(
  lockfilePath: string,
  ownerPid: number | undefined,
  options: IDaemonOrphanReaperOptions
): Promise<void> {
  const stranded: IReapContext[] = listOperationGroupsDaemonPids(lockfilePath)
    .filter((pid: number) => pid !== ownerPid)
    .map((pid: number) => createReapContext(pid, options))
    .filter(isStranded);
  for (const { deadPid } of stranded) {
    await reapDeadDaemonOperationGroupsAsync(lockfilePath, deadPid, options);
  }
}
