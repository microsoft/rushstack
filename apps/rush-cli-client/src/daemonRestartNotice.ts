// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  formatDaemonRestartCause,
  type IDaemonRestartNotice,
  type IDaemonRestartWaitDetails
} from '@rushstack/rush-client-core';
import type { DaemonRestartReason } from '@rushstack/rush-daemon-protocol';

/** The most variables that a restart line names before it says how many more differed. */
const MAX_NAMED_VARIABLES: number = 4;

/** Lists names as `A`, `A and B`, `A, B and C`, or `A, B, C, D and 2 more`. */
function formatVariableNames(names: readonly string[]): string {
  const items: string[] = names.slice(0, MAX_NAMED_VARIABLES);
  if (names.length > items.length) items.push(`${names.length - items.length} more`);
  const last: string | undefined = items.pop();
  return items.length === 0 ? (last ?? '') : `${items.join(', ')} and ${last}`;
}

/** Says why the daemon restarted, or returns `undefined` for a reason that this client does not know. */
function formatRestartedCause(reason: DaemonRestartReason | undefined): string | undefined {
  switch (reason?.kind) {
    case 'installationChanged':
      return `The daemon's installation at ${reason.folder} was ${reason.change}`;
    case 'environmentChanged': {
      // Names only: a value, such as NODE_OPTIONS's, can hold a secret.
      const { variableNames } = reason;
      const names: string = variableNames.length === 0 ? '' : ` in ${formatVariableNames(variableNames)}`;
      return `A command's environment differed from the daemon's${names}`;
    }
    default:
      return undefined;
  }
}

/**
 * Returns the line that tells the user why the daemon restarted during a command, or `undefined` for a restart
 * that needs no explanation.
 */
export function formatDaemonRestartNotice(notice: IDaemonRestartNotice, rushx: boolean): string | undefined {
  const { reason, successorPid } = notice;
  const cause: string | undefined = formatRestartedCause(reason);
  if (cause === undefined) return undefined;
  const pid: string = successorPid === undefined ? '' : ` (PID ${successorPid})`;
  return `${rushx ? 'rushx-client' : 'rush-client'}: ${cause}; restarted the daemon${pid}.`;
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

/** A request that waits for a daemon restart says so again when it has written nothing about the wait for this long. */
export const RESTART_WAIT_REPEAT_MS: number = 25_000;

/** What a queue position says about a wait for a daemon restart. */
export interface IDaemonRestartWait {
  /**
   * How many requests the wait counts: those that the daemon serves, and for a rushx script that waits for another
   * request's restart, also those that wait to restart the daemon.
   */
  readonly position: number;
  readonly reason: DaemonRestartReason;
  readonly details: IDaemonRestartWaitDetails;
}

/** Options for {@link formatDaemonRestartWait}. */
export interface IDaemonRestartWaitLineOptions extends IDaemonRestartWait {
  /** The process ID of the daemon that restarts. */
  readonly daemonPid: number | undefined;
  /** How long the request has waited. From a second on, the line says so. */
  readonly elapsedMs?: number;
}

function formatCount(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function formatIncludedScripts(scriptCount: number): string {
  return scriptCount > 0 ? `, including ${formatCount(scriptCount, 'rushx script')}` : '';
}

/**
 * Says what a request that waits for a daemon restart waits for and why the daemon restarts, for example
 * "waiting for 2 running requests to finish, including 1 rushx script; the daemon (PID 41) then restarts, because
 * common/config/rush/pnpm-lock.yaml changed". A rushx script that waits for another request's restart gets
 * "waiting for the daemon (PID 41) to restart for another request (2 requests ahead), because ...". The line names
 * environment variables, never their values, and leaves out a cause that this client cannot word.
 */
export function formatDaemonRestartWait(options: IDaemonRestartWaitLineOptions): string {
  const { position, reason, details, daemonPid, elapsedMs = 0 } = options;
  const anotherRequest: boolean = !!details.restartsForAnotherRequest;
  const cause: string | undefined = formatDaemonRestartCause(
    reason,
    anotherRequest ? 'anotherRequest' : 'thisRequest'
  );
  const because: string = cause === undefined ? '' : `, ${cause}`;
  const pid: string = daemonPid === undefined ? '' : ` (PID ${daemonPid})`;
  const waiting: string =
    elapsedMs < 1000 ? 'waiting' : `still waiting after ${Math.round(elapsedMs / 1000)}s`;
  const scriptCount: number = details.scriptCount ?? 0;
  if (anotherRequest) {
    const ahead: string = `${formatCount(position, 'request')} ahead${formatIncludedScripts(scriptCount)}`;
    return `${waiting} for the daemon${pid} to restart for another request (${ahead})${because}`;
  }
  // Scripts are named, since a script such as a dev server may run until it is stopped.
  const allScripts: boolean = scriptCount >= position;
  const running: string = formatCount(position, allScripts ? 'running rushx script' : 'running request');
  const scripts: string = allScripts ? '' : formatIncludedScripts(scriptCount);
  return `${waiting} for ${running} to finish${scripts}; the daemon${pid} then restarts${because}`;
}

/** The part of a restart wait that a pipe gets a line for at once when it changes: whose restart, and why. */
function getRestartWaitCause(wait: IDaemonRestartWait): string {
  const anotherRequest: boolean = !!wait.details.restartsForAnotherRequest;
  const cause: string | undefined = formatDaemonRestartCause(
    wait.reason,
    anotherRequest ? 'anotherRequest' : 'thisRequest'
  );
  return `${anotherRequest}:${cause ?? wait.reason.kind}`;
}

/** The agent renderer methods that tell an agent why a request waits or restarted. */
export interface IAgentRequestNoticeRenderer {
  note(line: string): void;
  setPhase(phase: string): void;
  onQueuePosition(position: number): void;
  /** See `AgentProgressRenderer.onRestartWait`. */
  onRestartWait(wait: string, announce: boolean): void;
}

/**
 * Where a request's queue positions and restart lines go.
 */
export interface IDaemonRequestNoticeTarget extends IDaemonRestartNoticeTarget {
  readonly agentRenderer: IAgentRequestNoticeRenderer | undefined;
  /**
   * Without an agent renderer, a terminal gets a line for every change of a restart wait and every queue position,
   * and a pipe gets a line when a restart wait begins or its cause changes. Both get the restart wait line again
   * with the time waited when {@link RESTART_WAIT_REPEAT_MS} passes without one.
   */
  readonly stderrIsTTY: boolean;
  /** The process ID of the daemon that serves the request first. */
  readonly daemonPid: number | undefined;
  /** Returns the current time in milliseconds. Defaults to `Date.now`. */
  readonly now?: () => number;
}

/**
 * The callbacks of one request that tell the user why it waits or restarted.
 */
export interface IDaemonRequestNoticeHandlers {
  readonly onRestartAsync: (notice: IDaemonRestartNotice) => Promise<void>;
  readonly onQueuePositionAsync: (
    position: number,
    restartReason?: DaemonRestartReason,
    restartWait?: IDaemonRestartWaitDetails
  ) => Promise<void>;
  /** The daemon admitted the request's input, so a rushx script starts, and no longer waits. */
  readonly onInputAdmittedAsync: () => Promise<void>;
  /** The request's output or an event arrived, so it no longer waits. */
  readonly onRequestProgress: () => void;
  /**
   * The request ended, or the client asked rushd to cancel it: stops repeating the restart wait line, and ignores
   * later queue positions.
   */
  readonly dispose: () => void;
}

interface IRestartWaitState {
  readonly startedAtMs: number;
  wait: IDaemonRestartWait;
  /** The cause of the last restart wait that was announced; see {@link getRestartWaitCause}. */
  announcedCause: string | undefined;
  /** The last restart wait line without the time waited, so that a terminal gets a line for each change. */
  line: string | undefined;
  timer: ReturnType<typeof setTimeout> | undefined;
}

/**
 * Creates the callbacks that tell the user why a request waits or restarted. The lines name the daemon that serves
 * the request, which changes when the request follows a restart. A restart wait line is repeated until the request
 * restarts, gets input, output or an event, or waits for plain admission instead. Once the request ends or the
 * client asks rushd to cancel it (see `dispose`), nothing more is written.
 */
export function createDaemonRequestNoticeHandlers(
  target: IDaemonRequestNoticeTarget
): IDaemonRequestNoticeHandlers {
  const { agentRenderer, stderrIsTTY, now = Date.now } = target;
  const prefix: string = target.rushx ? 'rushx-client' : 'rush-client';
  const writeRestartNoticeAsync: (notice: IDaemonRestartNotice) => Promise<void> =
    createDaemonRestartNoticeHandler(target);
  let daemonPid: number | undefined = target.daemonPid;
  let restartWait: IRestartWaitState | undefined;
  let showedRestartWait: boolean = false;
  let disposed: boolean = false;

  const endRestartWait = (): void => {
    clearTimeout(restartWait?.timer);
    restartWait = undefined;
  };
  const writeRestartWaitAsync = async (state: IRestartWaitState): Promise<void> => {
    clearTimeout(state.timer);
    state.timer = setTimeout(() => {
      if (restartWait === state) writeRestartWaitAsync(state).catch(() => undefined);
    }, RESTART_WAIT_REPEAT_MS);
    state.timer.unref?.();
    const elapsedMs: number = now() - state.startedAtMs;
    const line: string = formatDaemonRestartWait({ ...state.wait, daemonPid, elapsedMs });
    await target.writeStderrAsync(`${prefix}: ${line}.\n`);
  };

  return {
    onRestartAsync: async (notice: IDaemonRestartNotice): Promise<void> => {
      endRestartWait();
      daemonPid = notice.successorPid;
      await writeRestartNoticeAsync(notice);
      // The phase still says that the request waits for the previous daemon.
      if (agentRenderer && showedRestartWait) agentRenderer.setPhase(RESUBMITTED_PHASE);
      showedRestartWait = false;
    },
    onQueuePositionAsync: async (
      position: number,
      restartReason?: DaemonRestartReason,
      details: IDaemonRestartWaitDetails = {}
    ): Promise<void> => {
      if (disposed) return;
      if (!restartReason) {
        endRestartWait();
        if (agentRenderer) agentRenderer.onQueuePosition(position);
        else if (stderrIsTTY) {
          await target.writeStderrAsync(`${prefix}: waiting for daemon admission (position ${position}).\n`);
        }
        return;
      }
      const wait: IDaemonRestartWait = { position, reason: restartReason, details };
      const state: IRestartWaitState = (restartWait ??= {
        startedAtMs: now(),
        wait,
        announcedCause: undefined,
        line: undefined,
        timer: undefined
      });
      state.wait = wait;
      const cause: string = getRestartWaitCause(wait);
      const announce: boolean = cause !== state.announcedCause;
      state.announcedCause = cause;
      const line: string = formatDaemonRestartWait({ ...wait, daemonPid });
      const changed: boolean = line !== state.line;
      state.line = line;
      if (agentRenderer) {
        showedRestartWait = true;
        // The agent renderer's own status lines repeat the phase.
        agentRenderer.onRestartWait(line, announce);
      } else if (announce || (stderrIsTTY && changed)) {
        await writeRestartWaitAsync(state);
      }
    },
    onInputAdmittedAsync: async (): Promise<void> => endRestartWait(),
    onRequestProgress: endRestartWait,
    dispose: (): void => {
      disposed = true;
      endRestartWait();
    }
  };
}
