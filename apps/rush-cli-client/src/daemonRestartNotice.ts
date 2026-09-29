// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IDaemonRestartNotice } from '@rushstack/rush-client-core';
import type { DaemonRestartReason } from '@rushstack/rush-daemon-protocol';

/**
 * Returns the line that tells the user why the daemon restarted during a command, or `undefined` for a restart
 * that needs no explanation.
 */
export function formatDaemonRestartNotice(notice: IDaemonRestartNotice, rushx: boolean): string | undefined {
  const { reason, successorPid } = notice;
  if (reason?.kind !== 'installationChanged') return undefined;
  const pid: string = successorPid === undefined ? '' : ` (PID ${successorPid})`;
  return (
    `${rushx ? 'rushx-client' : 'rush-client'}: The daemon's installation at ${reason.folder} was ` +
    `${reason.change}; restarted the daemon${pid}.`
  );
}

/**
 * Where a restart line goes: the agent renderer when one is active, and otherwise stderr.
 */
export interface IDaemonRestartNoticeTarget {
  readonly rushx: boolean;
  readonly agentRenderer: { note(line: string): void } | undefined;
  readonly writeStderrAsync: (text: string) => Promise<void>;
}

/**
 * Creates the `onRestartAsync` callback that prints {@link formatDaemonRestartNotice}'s line.
 */
export function createDaemonRestartNoticeHandler(
  target: IDaemonRestartNoticeTarget
): (notice: IDaemonRestartNotice) => Promise<void> {
  return async (notice: IDaemonRestartNotice): Promise<void> => {
    const line: string | undefined = formatDaemonRestartNotice(notice, target.rushx);
    if (!line) return;
    if (target.agentRenderer) target.agentRenderer.note(line);
    else await target.writeStderrAsync(`${line}\n`);
  };
}

/** The agent phase after a request that waited for a restart follows it to the new daemon. */
export const RESUBMITTED_PHASE: string =
  'request resubmitted to the new daemon; preparing the workspace graph';

/**
 * Returns what a queued request waits for when the daemon answers it with a restart once the requests ahead of it
 * finish, or `undefined` for a queue position that needs no explanation.
 */
export function formatDaemonRestartWait(
  position: number,
  reason: DaemonRestartReason | undefined,
  daemonPid: number | undefined
): string | undefined {
  if (reason?.kind !== 'installationChanged') return undefined;
  const pid: string = daemonPid === undefined ? '' : ` (PID ${daemonPid})`;
  return (
    `waiting for the running requests to finish (position ${position}); the daemon${pid} then restarts, ` +
    `because its installation at ${reason.folder} was ${reason.change}`
  );
}

/**
 * Where a request's queue positions and restart lines go.
 */
export interface IDaemonRequestNoticeTarget extends IDaemonRestartNoticeTarget {
  readonly agentRenderer:
    | { note(line: string): void; setPhase(phase: string): void; onQueuePosition(position: number): void }
    | undefined;
  /** On a pipe, only the first {@link formatDaemonRestartWait} line is written, and plain positions are not. */
  readonly stderrIsTTY: boolean;
  /** The process ID of the daemon that serves the request first. */
  readonly daemonPid: number | undefined;
}

/**
 * The `onRestartAsync` and `onQueuePositionAsync` callbacks of one request.
 */
export interface IDaemonRequestNoticeHandlers {
  readonly onRestartAsync: (notice: IDaemonRestartNotice) => Promise<void>;
  readonly onQueuePositionAsync: (position: number, restartReason?: DaemonRestartReason) => Promise<void>;
}

/**
 * Creates the callbacks that tell the user why a request waits or restarted. Queue positions name the daemon that
 * serves the request, which changes when the request follows a restart.
 */
export function createDaemonRequestNoticeHandlers(
  target: IDaemonRequestNoticeTarget
): IDaemonRequestNoticeHandlers {
  const { agentRenderer, stderrIsTTY } = target;
  const writeRestartNoticeAsync: (notice: IDaemonRestartNotice) => Promise<void> =
    createDaemonRestartNoticeHandler(target);
  let daemonPid: number | undefined = target.daemonPid;
  let wroteRestartWait: boolean = false;
  return {
    onRestartAsync: async (notice: IDaemonRestartNotice): Promise<void> => {
      daemonPid = notice.successorPid;
      await writeRestartNoticeAsync(notice);
      // The phase still says that the request waits for the previous daemon.
      if (agentRenderer && wroteRestartWait) agentRenderer.setPhase(RESUBMITTED_PHASE);
      wroteRestartWait = false;
    },
    onQueuePositionAsync: async (position: number, restartReason?: DaemonRestartReason): Promise<void> => {
      const wait: string | undefined = formatDaemonRestartWait(position, restartReason, daemonPid);
      if (agentRenderer) {
        wroteRestartWait ||= wait !== undefined;
        if (wait) agentRenderer.setPhase(wait);
        else agentRenderer.onQueuePosition(position);
      } else if (wait && (stderrIsTTY || !wroteRestartWait)) {
        wroteRestartWait = true;
        await target.writeStderrAsync(`${target.rushx ? 'rushx-client' : 'rush-client'}: ${wait}.\n`);
      } else if (!wait && stderrIsTTY) {
        await target.writeStderrAsync(`rush-client: waiting for daemon admission (position ${position}).\n`);
      }
    }
  };
}
