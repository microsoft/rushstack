// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { getOperationGroupsFolder, readOperationGroupRecords } from './DaemonOperationGroups';
import type { IDaemonPaths } from './DaemonPaths';
import { listLiveGroupMembers } from './DaemonProcessStat';
import type { IProcessStat } from './DaemonProcessStat';

const NO_RECORDS: number = 0;

function isOtherProcess(stat: IProcessStat): boolean {
  return stat.pid !== process.pid;
}

/**
 * Whether this daemon process has children that a successor must reap if it exits without joining them: a
 * recorded operation group that still runs, or another live member of the daemon's own process group.
 *
 * @remarks
 * Linux only, like the records it reads. Elsewhere it finds none.
 */
export function hasProcessesToReap(paths: IDaemonPaths): boolean {
  const folder: string = getOperationGroupsFolder(paths.lockfilePath, process.pid);
  return (
    readOperationGroupRecords(folder).length > NO_RECORDS ||
    listLiveGroupMembers(process.pid).some(isOtherProcess)
  );
}
