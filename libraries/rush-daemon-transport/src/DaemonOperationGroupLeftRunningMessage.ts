// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { DAEMON_OPERATION_GROUPS_ENV_VAR } from './DaemonOperationGroupMarker';
import type {
  DaemonOperationGroupLeftRunningReason,
  IDaemonOperationGroupLeftRunning
} from './DaemonReclaimOptions';

type DescribeReason = (group: IDaemonOperationGroupLeftRunning) => string;

const REASON_DESCRIPTIONS: Readonly<Record<DaemonOperationGroupLeftRunningReason, DescribeReason>> = {
  callerGroup: () =>
    'its ID is the PID or the process group ID of this process, or this process cannot read its own group',
  daemonPidInUse: () => "another process has that daemon's PID now",
  leaderChanged: ({ processGroupId }: IDaemonOperationGroupLeftRunning) =>
    `the process with PID ${processGroupId} now is not the leader that the daemon recorded`,
  otherSession: () => 'its leader has exited, and a process of the group is in another session',
  noMarker: () =>
    `its leader has exited, and no process of the group has that daemon's ${DAEMON_OPERATION_GROUPS_ENV_VAR} ` +
    'value, which a daemon from a release before that variable does not set'
};

/**
 * Describes, in one line without a final period, a process group that a reclaim left running (see
 * `IDaemonReclaimOptions.onOperationGroupLeftRunning`): which group, which exited daemon recorded it, and why
 * the reclaim left it running. "This process" in it is the process that reclaimed.
 *
 * @remarks
 * For example: "left process group 5001 running, which the exited daemon (PID 4242) recorded for an
 * operation: its leader has exited, and a process of the group is in another session".
 *
 * @beta
 */
export function formatOperationGroupLeftRunning(group: IDaemonOperationGroupLeftRunning): string {
  return (
    `left process group ${group.processGroupId} running, which the exited daemon (PID ${group.daemonPid}) ` +
    `recorded for an operation: ${REASON_DESCRIPTIONS[group.reason](group)}`
  );
}
