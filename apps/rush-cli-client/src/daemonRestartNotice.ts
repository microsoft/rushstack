// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  DaemonClientError,
  DaemonRestartFailedError,
  formatDaemonRestartCause,
  type IDaemonRestartNotice,
  type IDaemonRestartWaitDetails
} from '@rushstack/rush-client-core';
import type { DaemonRestartReason, IDaemonContinuingOperations } from '@rushstack/rush-daemon-protocol';

import { formatContinuingOperationNames, formatContinuingOperations } from './continuingOperations';

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
 * Returns the line that tells the user why the daemon restarted during a command, or why the command is sent to a
 * new daemon, or `undefined` for a restart that needs no explanation.
 */
export function formatDaemonRestartNotice(notice: IDaemonRestartNotice, rushx: boolean): string | undefined {
  const { reason, successorPid, exitedPid } = notice;
  const pid: string = successorPid === undefined ? '' : ` (PID ${successorPid})`;
  const prefix: string = rushx ? 'rushx-client' : 'rush-client';
  if (exitedPid !== undefined) {
    return `${prefix}: rushd (PID ${exitedPid}) exited while the command was queued; sending the command to a new daemon${pid}.`;
  }
  const cause: string | undefined = formatRestartedCause(reason);
  if (cause === undefined) return undefined;
  return `${prefix}: ${cause}; restarted the daemon${pid}.`;
}

/**
 * Returns the error to report when a command's daemon restarted and the new daemon did not start. Its message says
 * first why the daemon restarted, so that a user whose environment keeps the daemon from starting knows what to
 * change. Any other error, and a restart for a reason that this client does not know, is returned unchanged.
 */
export function explainDaemonRestartFailure(error: unknown): unknown {
  if (!(error instanceof DaemonRestartFailedError)) return error;
  const cause: string | undefined = formatRestartedCause(error.restartReason);
  if (cause === undefined) return error;
  return new DaemonClientError(error.code, `${cause}; the restarted daemon did not start: ${error.message}`, {
    cause: error
  });
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
  /**
   * Why the daemon restarts. Without one, the request restarts the daemon itself once it ends, as a native
   * `install` or `update` does, and first waits for the rushx scripts that `details.scriptCount` counts to finish.
   */
  readonly reason: DaemonRestartReason | undefined;
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
 * "waiting for the daemon (PID 41) to restart for another request (2 requests ahead), because ...", and a request
 * that restarts the daemon itself once it ends gets "waiting for 1 running rushx script to finish, since this
 * command restarts the daemon (PID 41), which would end it". The line names environment variables, never their
 * values, and leaves out a cause that this client cannot word.
 */
export function formatDaemonRestartWait(options: IDaemonRestartWaitLineOptions): string {
  const { position, reason, details, daemonPid, elapsedMs = 0 } = options;
  const anotherRequest: boolean = !!details.restartsForAnotherRequest;
  const pid: string = daemonPid === undefined ? '' : ` (PID ${daemonPid})`;
  const waiting: string =
    elapsedMs < 1000 ? 'waiting' : `still waiting after ${Math.round(elapsedMs / 1000)}s`;
  const scriptCount: number = details.scriptCount ?? 0;
  if (!reason) {
    const scripts: number = scriptCount || position;
    return (
      `${waiting} for ${formatCount(scripts, 'running rushx script')} to finish, since this command restarts ` +
      `the daemon${pid}, which would end ${scripts === 1 ? 'it' : 'them'}`
    );
  }
  const cause: string | undefined = formatDaemonRestartCause(
    reason,
    anotherRequest ? 'anotherRequest' : 'thisRequest'
  );
  const because: string = cause === undefined ? '' : `, ${cause}`;
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
  const { reason, details } = wait;
  if (!reason) return 'thisCommand';
  const anotherRequest: boolean = !!details.restartsForAnotherRequest;
  const cause: string | undefined = formatDaemonRestartCause(
    reason,
    anotherRequest ? 'anotherRequest' : 'thisRequest'
  );
  return `${anotherRequest}:${cause ?? reason.kind}`;
}

/**
 * Whether a restart wait line for `waitReason` already said why the daemon restarted for `reason`, so that the
 * restart notice would only repeat it: the same variables, or the same change to the same installation.
 */
function isRestartCauseWritten(
  waitReason: DaemonRestartReason | undefined,
  reason: DaemonRestartReason | undefined
): boolean {
  if (waitReason?.kind === 'environmentChanged' && reason?.kind === 'environmentChanged') {
    const names: readonly string[] = reason.variableNames;
    return (
      waitReason.variableNames.length === names.length &&
      waitReason.variableNames.every((name: string, index: number) => name === names[index])
    );
  }
  if (waitReason?.kind === 'installationChanged' && reason?.kind === 'installationChanged') {
    return waitReason.folder === reason.folder && waitReason.change === reason.change;
  }
  return false;
}

/** The agent renderer methods that tell an agent why a request waits or restarted. */
export interface IAgentRequestNoticeRenderer {
  note(line: string): void;
  /** See `AgentProgressRenderer.onResubmitted`. */
  onResubmitted(phase: string): void;
  /** See `AgentProgressRenderer.onQueuePosition`. */
  onQueuePosition(position: number, continuingOperations?: IDaemonContinuingOperations): void;
  /** See `AgentProgressRenderer.onRestartWait`. Returns whether it wrote the wait as a line. */
  onRestartWait(wait: string, announce: boolean): boolean;
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
    restartWait?: IDaemonRestartWaitDetails,
    /** Set while the request waits only for operations that an earlier failed command left running. */
    continuingOperations?: IDaemonContinuingOperations
  ) => Promise<void>;
  /** The daemon admitted the request's input, so a rushx script starts, and no longer waits. */
  readonly onInputAdmittedAsync: () => Promise<void>;
  /** The request's output or an event arrived, so it no longer waits. */
  readonly onRequestProgress: () => void;
  /**
   * The agent renderer shows another wait of the request at its daemon as the phase, for example a wait for another
   * Rush process to release the repository's lock. A restart then replaces the phase, as after a restart wait.
   */
  readonly onAgentWaitShown: () => void;
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
 * restarts, gets input, output or an event, or waits for plain admission instead. A restart gets no notice when the
 * request already wrote a wait line for the same cause since it last restarted, since that line said why. Once the
 * request ends or the client asks rushd to cancel it (see `dispose`), nothing more is written.
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
  // Whether the agent phase showed a wait at the daemon since the request last restarted.
  let showedAgentWait: boolean = false;
  // The reason of the last wait line written as a line since the request last restarted.
  let writtenWaitReason: DaemonRestartReason | undefined;
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
    writtenWaitReason = state.wait.reason;
    await target.writeStderrAsync(`${prefix}: ${line}.\n`);
  };

  return {
    onRestartAsync: async (notice: IDaemonRestartNotice): Promise<void> => {
      endRestartWait();
      daemonPid = notice.successorPid;
      const waitReason: DaemonRestartReason | undefined = writtenWaitReason;
      writtenWaitReason = undefined;
      if (!isRestartCauseWritten(waitReason, notice.reason)) await writeRestartNoticeAsync(notice);
      // The phase and the status lines still say what the request waited for at the previous daemon.
      if (agentRenderer && (showedAgentWait || notice.exitedPid !== undefined)) {
        agentRenderer.onResubmitted(RESUBMITTED_PHASE);
      }
      showedAgentWait = false;
    },
    onQueuePositionAsync: async (
      position: number,
      restartReason?: DaemonRestartReason,
      details: IDaemonRestartWaitDetails = {},
      continuing?: IDaemonContinuingOperations
    ): Promise<void> => {
      if (disposed) return;
      // Without a reason, a count of scripts means that the request restarts the daemon itself once it ends.
      if (!restartReason && !details.scriptCount) {
        endRestartWait();
        if (agentRenderer) agentRenderer.onQueuePosition(position, continuing);
        else if (stderrIsTTY) {
          const behind: string = continuing
            ? `${continuing.stopping ? ' while rushd stops' : ' behind'} ` +
              `${formatContinuingOperations(continuing)}${formatContinuingOperationNames(continuing)}`
            : '';
          await target.writeStderrAsync(
            `${prefix}: waiting for daemon admission (position ${position})${behind}.\n`
          );
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
        showedAgentWait = true;
        // The agent renderer's own status lines repeat the phase.
        if (agentRenderer.onRestartWait(line, announce)) writtenWaitReason = restartReason;
      } else if (announce || (stderrIsTTY && changed)) {
        await writeRestartWaitAsync(state);
      }
    },
    onInputAdmittedAsync: async (): Promise<void> => endRestartWait(),
    onRequestProgress: endRestartWait,
    onAgentWaitShown: (): void => {
      showedAgentWait = true;
    },
    dispose: (): void => {
      disposed = true;
      endRestartWait();
    }
  };
}
