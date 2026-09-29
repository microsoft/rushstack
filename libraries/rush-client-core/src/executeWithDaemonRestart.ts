// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { setTimeout as delayAsync } from 'node:timers/promises';

import {
  DAEMON_WORKSPACE_RESTART_PROTOCOL_MINOR,
  type DaemonRestartReason,
  type IDaemonRequestAdmissionOptions,
  type IDaemonRequestEnvelope
} from '@rushstack/rush-daemon-protocol';
import { readDaemonLockfile, type IDaemonLockfile } from '@rushstack/rush-daemon-transport';

import {
  connectOrStartDaemonAsync,
  connectToPlannedSuccessorAsync,
  type IConnectOrStartDaemonOptions
} from './connectOrStartDaemon';
import { captureDaemonRequest } from './captureDaemonRequest';
import type { DaemonClient, DaemonClientOutcome, IDaemonClientExecuteOptions } from './DaemonClient';
import {
  DAEMON_DISCONNECTED_AFTER_RESEND_MESSAGE,
  DAEMON_DISCONNECTED_MESSAGE,
  DaemonClientError
} from './DaemonClientError';
import {
  DaemonExitedWhileQueuedError,
  explainLostConnectionAsync,
  observeServingDaemonAsync,
  type IServingDaemon
} from './DaemonDisconnect';

/**
 * The maximum number of successors a single request follows. Each restart serves at least one other
 * environment first, so this bounds the wait when several environments share one workspace daemon.
 */
const MAX_RESTART_RETRIES: number = 6;
const RETRY_JITTER_BASE_MS: number = 50;
const RETRY_JITTER_MAX_MS: number = 1000;
/** Matches the default of {@link IConnectOrStartDaemonOptions.startupTimeoutMs}. */
const DEFAULT_STARTUP_TIMEOUT_MS: number = 15000;

/**
 * A new daemon that a request followed: a successor that a daemon restart started, or, with `exitedPid`, a new daemon
 * that the request is sent to because the previous one exited while the request waited in its queue. That notice
 * comes before the new daemon starts, so that the wait for it is not silent.
 * @beta
 */
export interface IDaemonRestartNotice {
  /** 1 for the first new daemon that the request followed. */
  readonly restart: number;
  /** Why the previous daemon asked for the restart; `undefined` when it did not say, or with `exitedPid`. */
  readonly reason: DaemonRestartReason | undefined;
  /** The process ID of the daemon that the request is sent to next; `undefined` with `exitedPid`. */
  readonly successorPid: number | undefined;
  /**
   * Set when the previous daemon exited while the request waited in its queue, before it started the request: that
   * daemon's process ID.
   */
  readonly exitedPid?: number;
}

/**
 * Options for {@link executeWithDaemonRestartAsync}.
 * @beta
 */
export interface IExecuteWithDaemonRestartOptions extends IDaemonClientExecuteOptions {
  /** Called after a new daemon is ready, before the request is sent to it. */
  readonly onRestartAsync?: (notice: IDaemonRestartNotice) => Promise<void>;
}

/**
 * Thrown by {@link executeWithDaemonRestartAsync} when the previous daemon said why it restarted and the daemon that
 * replaces it did not become ready. Its code and message are those of the startup error, which is its cause.
 * @beta
 */
export class DaemonRestartFailedError extends DaemonClientError {
  /** Why the previous daemon asked for the restart. */
  public readonly restartReason: DaemonRestartReason;

  public constructor(startupError: DaemonClientError, restartReason: DaemonRestartReason) {
    super(startupError.code, startupError.message, { cause: startupError });
    this.name = 'DaemonRestartFailedError';
    this.restartReason = restartReason;
  }
}

/**
 * Executes on a ready client, retrying for a typed pre-execution restart, and once for a daemon that exited while
 * the request waited in its queue.
 * Preserves the original request, callbacks and unread input; retries no other connection loss.
 * Restarts are retried with jittered backoff inside the request's explicit admission deadline, if any (a
 * client-default timeout applies to each daemon separately); once the retries or the deadline are exhausted,
 * a `fallback` outcome lets the caller run in-process instead.
 * The connection options must select the request's expected daemon and startup environment.
 * A connection lost before the result is reported as a `disconnected` error that says whether the daemon
 * process exited, what its launcher log recorded and how to recover, unless the request was aborted first.
 * If the daemon exited while the request waited in its queue and had not started it (see
 * {@link DaemonClient.queuedWithoutStarting}), the request is instead sent to a new daemon, started as
 * `connectOrStartDaemonAsync` would. Before that daemon starts, `onRestartAsync` gets the exited daemon's PID as
 * `exitedPid`. That happens once per call, and within an explicit admission deadline.
 * @beta
 */
export async function executeWithDaemonRestartAsync(
  client: DaemonClient,
  connection: IConnectOrStartDaemonOptions,
  options: IExecuteWithDaemonRestartOptions
): Promise<DaemonClientOutcome> {
  const { onRestartAsync, ...execution } = options;
  const startedAt: number = Date.now();
  const abortSignal: AbortSignal | undefined =
    execution.abortSignal && connection.abortSignal
      ? AbortSignal.any([execution.abortSignal, connection.abortSignal])
      : (execution.abortSignal ?? connection.abortSignal);
  const admission: IDaemonRequestAdmissionOptions | undefined = execution.request.admission;
  // A client-default timeout applies to each daemon's own admission, not to following its restarts: a daemon
  // restarts only after the requests it serves finish, which is progress, so each successor gets the original
  // request. An explicit timeout is one deadline across restarts.
  const waitTimeoutMs: number | undefined = admission?.waitTimeoutIsDefault
    ? undefined
    : admission?.waitTimeoutMs;
  const attempts: IRequestAttempts = {
    connection,
    execution: { ...execution, abortSignal },
    onRestartAsync,
    getRemainingMs: () =>
      waitTimeoutMs === undefined ? undefined : waitTimeoutMs - (Date.now() - startedAt),
    followed: 0
  };
  try {
    return await followRestartsAsync(client, execution.request, attempts);
  } catch (error) {
    if (!(error instanceof DaemonExitedWhileQueuedError)) throw error;
    return await resendAfterExitAsync(error, attempts);
  }
}

/** One call's state across the daemons that its request is sent to. */
interface IRequestAttempts {
  readonly connection: IConnectOrStartDaemonOptions;
  /** The execution options, with an abort signal that also observes the connection's. */
  readonly execution: IDaemonClientExecuteOptions;
  readonly onRestartAsync: IExecuteWithDaemonRestartOptions['onRestartAsync'];
  /** The time left before the explicit admission deadline, or `undefined` without one. */
  readonly getRemainingMs: () => number | undefined;
  /** How many new daemons the request has followed. */
  followed: number;
}

/** Sends `request` to `client`, then to each successor that a typed pre-execution restart names. */
async function followRestartsAsync(
  client: DaemonClient,
  request: IDaemonRequestEnvelope,
  attempts: IRequestAttempts
): Promise<DaemonClientOutcome> {
  const { connection, execution, onRestartAsync, getRemainingMs } = attempts;
  const { abortSignal } = execution;
  let owner: IDaemonLockfile | undefined = await attestOwnerAsync(client, connection);
  let outcome: DaemonClientOutcome = await executeOnDaemonAsync(client, connection, {
    ...execution,
    request
  });
  let previous: DaemonClient | undefined;
  try {
    for (let retry: number = 1; outcome.kind === 'result' && outcome.result.retryAfterRestart; retry++) {
      const reason: DaemonRestartReason | undefined = outcome.result.restartReason;
      if (!owner) {
        throw new DaemonClientError(
          'startupFailed',
          'Cannot attest the restarting daemon ownership; the request was not retried.'
        );
      }
      if (abortSignal?.aborted) return abortedOutcome(execution);
      if (retry > MAX_RESTART_RETRIES || isExpired(getRemainingMs())) {
        return restartExhaustedOutcome(retry - 1);
      }
      let successor: DaemonClient;
      let boundedByAdmission: boolean = false;
      try {
        // The first retry follows the planned successor immediately; later ones back off with jitter so
        // clients whose environments differ do not reach each new successor in lockstep.
        if (retry > 1) {
          await delayAsync(getRetryDelayMs(retry, getRemainingMs()), undefined, { signal: abortSignal });
        }
        const remainingMs: number | undefined = getRemainingMs();
        if (isExpired(remainingMs)) return restartExhaustedOutcome(retry - 1);
        const startupTimeoutMs: number = connection.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS;
        // The successor handoff shares the request's admission deadline rather than starting a fresh one.
        boundedByAdmission = remainingMs !== undefined && remainingMs < startupTimeoutMs;
        // The restarting daemon launches the successor itself; this only connects while that process lives.
        successor = await connectToPlannedSuccessorAsync({
          ...connection,
          startupTimeoutMs: boundedByAdmission ? Math.max(1, Math.ceil(remainingMs!)) : startupTimeoutMs,
          previousDaemon: { pid: owner.pid, startedAt: owner.startedAt },
          abortSignal
        });
      } catch (error) {
        if (isAbortError(error, abortSignal)) return abortedOutcome(execution);
        // A startup error after the admission deadline expired is the deadline, not a new failure mode.
        if (boundedByAdmission && error instanceof DaemonClientError && isExpired(getRemainingMs())) {
          return restartExhaustedOutcome(retry);
        }
        // The reason tells a user whose environment keeps the new daemon from starting what to change.
        throw reason && error instanceof DaemonClientError
          ? new DaemonRestartFailedError(error, reason)
          : error;
      } finally {
        await previous?.closeAsync().catch(() => undefined);
        previous = undefined;
      }
      previous = successor;
      const remainingMs: number | undefined = getRemainingMs();
      if (isExpired(remainingMs)) return restartExhaustedOutcome(retry);
      owner = await attestOwnerAsync(successor, connection);
      attempts.followed++;
      await onRestartAsync?.({
        restart: attempts.followed,
        reason,
        successorPid: (await successor.status).pid
      });
      outcome = await executeOnDaemonAsync(successor, connection, {
        ...execution,
        request: withRemainingAdmission(execution.request, remainingMs)
      });
    }
    return outcome;
  } finally {
    await previous?.closeAsync().catch(() => undefined);
  }
}

/**
 * Sends the request to a new daemon once, after the daemon that had it exited while the request waited in its
 * queue. Throws `exit` if the connection cannot start a daemon, or if the admission deadline expires first.
 */
async function resendAfterExitAsync(
  exit: DaemonExitedWhileQueuedError,
  attempts: IRequestAttempts
): Promise<DaemonClientOutcome> {
  const { connection, execution, onRestartAsync, getRemainingMs } = attempts;
  const { abortSignal } = execution;
  if (abortSignal?.aborted) return abortedOutcome(execution);
  if (!connection.startCommand && !connection.resolveStartCommandAsync) throw exit;
  const remainingMs: number | undefined = getRemainingMs();
  if (isExpired(remainingMs)) throw exit;
  const startupTimeoutMs: number = connection.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS;
  const limitedByAdmission: boolean = remainingMs !== undefined && remainingMs < startupTimeoutMs;
  attempts.followed++;
  await onRestartAsync?.({
    restart: attempts.followed,
    reason: undefined,
    successorPid: undefined,
    exitedPid: exit.daemonPid
  });
  let successor: DaemonClient;
  try {
    // The daemon that exited planned no successor, and explaining its exit reclaimed its files.
    successor = await connectOrStartDaemonAsync({
      ...connection,
      startupTimeoutMs: limitedByAdmission ? Math.max(1, Math.ceil(remainingMs!)) : startupTimeoutMs,
      abortSignal
    });
  } catch (error) {
    if (isAbortError(error, abortSignal)) return abortedOutcome(execution);
    if (limitedByAdmission && error instanceof DaemonClientError && isExpired(getRemainingMs())) throw exit;
    throw error instanceof DaemonClientError
      ? new DaemonClientError(
          error.code,
          `rushd (PID ${exit.daemonPid}) exited while the command was queued, and a new daemon did not start: ` +
            error.message,
          { cause: error }
        )
      : error;
  }
  try {
    const resendRemainingMs: number | undefined = getRemainingMs();
    if (isExpired(resendRemainingMs)) throw exit;
    return await followRestartsAsync(
      successor,
      withRemainingAdmission(execution.request, resendRemainingMs),
      attempts
    );
  } catch (error) {
    throw error === exit ? error : withResentMessage(error);
  } finally {
    await successor.closeAsync().catch(() => undefined);
  }
}

/** A lost connection after the resend says that the command was sent to a new daemon, not that it was not retried. */
function withResentMessage(error: unknown): unknown {
  if (!(error instanceof DaemonClientError) || !error.message.startsWith(DAEMON_DISCONNECTED_MESSAGE)) {
    return error;
  }
  return new DaemonClientError(
    error.code,
    DAEMON_DISCONNECTED_AFTER_RESEND_MESSAGE + error.message.slice(DAEMON_DISCONNECTED_MESSAGE.length),
    { cause: error.cause ?? error }
  );
}

/** Executes one attempt; a lost connection is explained by what happened to the daemon that served it. */
async function executeOnDaemonAsync(
  client: DaemonClient,
  connection: IConnectOrStartDaemonOptions,
  execution: IDaemonClientExecuteOptions
): Promise<DaemonClientOutcome> {
  const daemon: IServingDaemon | undefined = await observeServingDaemonAsync(client, connection.paths);
  try {
    return await client.executeAsync(execution);
  } catch (error) {
    // After cancellation the caller reports the cancellation, whatever the connection did afterwards.
    if (execution.abortSignal?.aborted) throw error;
    throw await explainLostConnectionAsync(
      error,
      daemon,
      execution.request,
      { onOrphansReaped: connection.onOrphansReaped },
      client.queuedWithoutStarting
    );
  }
}

/** The request with an explicit admission deadline of `remainingMs`, or unchanged without one. */
function withRemainingAdmission(
  request: IDaemonRequestEnvelope,
  remainingMs: number | undefined
): IDaemonRequestEnvelope {
  return remainingMs === undefined
    ? request
    : captureDaemonRequest({
        ...request,
        admission: { ...request.admission, waitTimeoutMs: Math.floor(remainingMs) }
      });
}

function isAbortError(error: unknown, abortSignal: AbortSignal | undefined): boolean {
  return (
    !!abortSignal?.aborted &&
    (error === abortSignal.reason ||
      (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ABORT_ERR'))
  );
}

function isExpired(remainingMs: number | undefined): boolean {
  return remainingMs !== undefined && remainingMs <= 0;
}
/** Returns the published ownership record only when it names the connected, restart-capable process. */
async function attestOwnerAsync(
  client: DaemonClient,
  connection: IConnectOrStartDaemonOptions
): Promise<IDaemonLockfile | undefined> {
  const owner: IDaemonLockfile | undefined = readDaemonLockfile(connection.paths.lockfilePath);
  const { pid } = await client.status;
  return client.protocolVersion.minor >= DAEMON_WORKSPACE_RESTART_PROTOCOL_MINOR &&
    owner !== undefined &&
    owner.pid === pid &&
    owner.socketPath === connection.paths.socketPath &&
    Number.isSafeInteger(owner.pid) &&
    owner.pid > 0 &&
    Number.isFinite(Date.parse(owner.startedAt))
    ? owner
    : undefined;
}

function getRetryDelayMs(retry: number, remainingMs: number | undefined): number {
  const ceilingMs: number = Math.min(RETRY_JITTER_MAX_MS, RETRY_JITTER_BASE_MS * 2 ** (retry - 1));
  const delayMs: number = Math.floor(ceilingMs / 2 + (Math.random() * ceilingMs) / 2);
  return remainingMs === undefined ? delayMs : Math.max(0, Math.min(delayMs, remainingMs - 1));
}

function restartExhaustedOutcome(restarts: number): DaemonClientOutcome {
  return {
    kind: 'fallback',
    reason: 'restartRetriesExhausted',
    message: `The daemon was still restarting for other environments after ${restarts} ${
      restarts === 1 ? 'restart' : 'restarts'
    }; no operation was started by the daemon`
  };
}

function abortedOutcome(execution: IDaemonClientExecuteOptions): DaemonClientOutcome {
  return {
    kind: 'result',
    result: { requestId: execution.request.requestId, exitCode: 130, outcome: 'aborted', aborted: true }
  };
}
