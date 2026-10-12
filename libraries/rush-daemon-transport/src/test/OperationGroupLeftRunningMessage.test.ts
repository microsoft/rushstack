// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { formatOperationGroupLeftRunning } from '../DaemonOperationGroupLeftRunningMessage';
import type { DaemonOperationGroupLeftRunningReason } from '../DaemonReclaimOptions';

const DAEMON_PID: number = 4242;
const GROUP_ID: number = 5001;
const PREFIX: string =
  `left process group ${GROUP_ID} running, which the exited daemon (PID ${DAEMON_PID}) recorded for an ` +
  'operation: ';
// The lines that clients search the launcher log for (see rush-client-core's ReclaimedDaemonLog).
const SEARCHED_LINE: RegExp = /rushd \(PID|rushd ready at|reset the daemon's files|left running/;

const DESCRIPTIONS: [DaemonOperationGroupLeftRunningReason, string][] = [
  [
    'callerGroup',
    'its ID is the PID or the process group ID of this process, or this process cannot read its own group'
  ],
  ['daemonPidInUse', "another process has that daemon's PID now"],
  ['leaderChanged', `the process with PID ${GROUP_ID} now is not the leader that the daemon recorded`],
  ['otherSession', 'its leader has exited, and a process of the group is in another session'],
  [
    'noMarker',
    "its leader has exited, and no process of the group has that daemon's RUSHD_OPERATION_GROUPS value, " +
      'which a daemon from a release before that variable does not set'
  ]
];

it.each(DESCRIPTIONS)('describes %s in one line that no client searches for', (reason, description) => {
  const line: string = formatOperationGroupLeftRunning({
    daemonPid: DAEMON_PID,
    processGroupId: GROUP_ID,
    reason
  });
  expect(line).toBe(`${PREFIX}${description}`);
  expect(line).not.toMatch(SEARCHED_LINE);
});
