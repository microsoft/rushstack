// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { formatNativeLockHolder, type IDaemonRestartWaitDetails } from '@rushstack/rush-client-core';
import type {
  DaemonRestartReason,
  IDaemonContinuingOperations,
  IDaemonNativeLockHolder
} from '@rushstack/rush-daemon-protocol';

import type { IDaemonRequestNoticeHandlers } from './daemonRestartNotice';

/** A request that waits for another Rush process says so again when it has written nothing about it for this long. */
export const NATIVE_LOCK_WAIT_REPEAT_MS: number = 10_000;

/**
 * Says what a request waits for while a Rush process that the daemon does not run holds the repository's lock, for
 * example "waiting for another Rush process (PID 41: rush install) to release this repository's lock", and from a
 * second on, "still waiting after 10s for another Rush process (PID 41: rush install) to release ...".
 */
export function formatNativeLockWait(holder: IDaemonNativeLockHolder, elapsedMs: number = 0): string {
  const waiting: string =
    elapsedMs < 1000 ? 'waiting' : `still waiting after ${Math.round(elapsedMs / 1000)}s`;
  return `${waiting} for ${formatNativeLockHolder(holder)} to release this repository's lock`;
}

/** Where the lines of {@link withNativeLockWaitNotices} go. */
export interface INativeLockWaitNoticeTarget {
  readonly rushx: boolean;
  /** See `AgentProgressRenderer.onRestartWait`, which shows any wait of a request that is not a queue position. */
  readonly agentRenderer: { onRestartWait(wait: string, announce: boolean): unknown } | undefined;
  readonly writeStderrAsync: (text: string) => Promise<void>;
  /** Returns the current time in milliseconds. Defaults to `Date.now`. */
  readonly now?: () => number;
}

/**
 * A request's notice handlers, whose queue positions can say that it waits for native Rush's repository lock. Their
 * queue positions take the arguments of `IDaemonClientExecuteOptions.onQueuePositionAsync`.
 */
export interface INativeLockWaitNoticeHandlers
  extends Omit<IDaemonRequestNoticeHandlers, 'onQueuePositionAsync' | 'onAgentWaitShown'> {
  readonly onQueuePositionAsync: (
    position: number,
    restartReason?: DaemonRestartReason,
    restartWait?: IDaemonRestartWaitDetails,
    nativeLockHolder?: IDaemonNativeLockHolder,
    continuingOperations?: IDaemonContinuingOperations
  ) => Promise<void>;
}

interface INativeLockWaitState {
  readonly startedAtMs: number;
  holder: IDaemonNativeLockHolder;
  /** Identifies the process that the last line named. */
  key: string;
  timer: ReturnType<typeof setTimeout> | undefined;
}

/**
 * Adds to a request's notice `handlers` the lines that say that the request waits for a Rush process that the daemon
 * does not run to release the repository's lock, and which process that is.
 *
 * @remarks
 * Without an agent renderer, a terminal and a pipe get a line at once and whenever another process holds the lock,
 * and the line again with the time waited when {@link NATIVE_LOCK_WAIT_REPEAT_MS} passes without one. An agent
 * renderer shows the wait as its phase instead, which its status lines repeat, and announces each process on a pipe;
 * a restart then replaces the phase, as after a restart wait.
 * The wait ends when the request gets another queue position, restarts, gets input, output or an event, or ends.
 * The other notices are the ones that `handlers` gives.
 */
export function withNativeLockWaitNotices(
  handlers: IDaemonRequestNoticeHandlers,
  target: INativeLockWaitNoticeTarget
): INativeLockWaitNoticeHandlers {
  const { agentRenderer, now = Date.now } = target;
  const prefix: string = target.rushx ? 'rushx-client' : 'rush-client';
  let wait: INativeLockWaitState | undefined;
  let disposed: boolean = false;

  const endWait = (): void => {
    clearTimeout(wait?.timer);
    wait = undefined;
  };
  const writeWaitAsync = async (state: INativeLockWaitState): Promise<void> => {
    clearTimeout(state.timer);
    state.timer = setTimeout(() => {
      if (wait === state) writeWaitAsync(state).catch(() => undefined);
    }, NATIVE_LOCK_WAIT_REPEAT_MS);
    state.timer.unref?.();
    const line: string = formatNativeLockWait(state.holder, now() - state.startedAtMs);
    await target.writeStderrAsync(`${prefix}: ${line}.\n`);
  };

  return {
    onRestartAsync: async (notice) => {
      endWait();
      await handlers.onRestartAsync(notice);
    },
    onQueuePositionAsync: async (
      position,
      restartReason,
      restartWait,
      nativeLockHolder,
      continuingOperations
    ) => {
      if (!nativeLockHolder || restartReason) {
        endWait();
        return await handlers.onQueuePositionAsync(
          position,
          restartReason,
          restartWait,
          continuingOperations
        );
      }
      if (disposed) return;
      // This ends a wait for a daemon restart, if the request waited for one; it waits for the lock instead.
      handlers.onRequestProgress();
      const key: string = `${nativeLockHolder.pid}:${nativeLockHolder.command}`;
      if (wait?.key === key || isSameProcessWithoutCommand(wait?.holder, nativeLockHolder)) return;
      const state: INativeLockWaitState = (wait ??= {
        startedAtMs: now(),
        holder: nativeLockHolder,
        key,
        timer: undefined
      });
      state.holder = nativeLockHolder;
      state.key = key;
      if (agentRenderer) {
        agentRenderer.onRestartWait(formatNativeLockWait(nativeLockHolder), true);
        // So that a restart replaces the phase, which names a process that only the previous daemon reported.
        handlers.onAgentWaitShown();
      } else await writeWaitAsync(state);
    },
    onInputAdmittedAsync: async () => {
      endWait();
      await handlers.onInputAdmittedAsync();
    },
    onRequestProgress: () => {
      endWait();
      handlers.onRequestProgress();
    },
    dispose: () => {
      disposed = true;
      endWait();
      handlers.dispose();
    }
  };
}

/**
 * Whether `found` is the process that `named` names, but without its command. A process's command can no longer be
 * read once it exits, yet it holds the lock until it is reaped, so the daemon can report it once more that way.
 */
function isSameProcessWithoutCommand(
  named: IDaemonNativeLockHolder | undefined,
  found: IDaemonNativeLockHolder
): boolean {
  return found.pid !== undefined && found.command === undefined && named?.pid === found.pid;
}
