// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { setTimeout as delayAsync } from 'node:timers/promises';

import {
  DAEMON_WORKSPACE_RESTART_PROTOCOL_MINOR,
  type DaemonRestartReason,
  type IDaemonRequestAdmissionOptions
} from '@rushstack/rush-daemon-protocol';
import { readDaemonLockfile, type IDaemonLockfile } from '@rushstack/rush-daemon-transport';

import { connectToPlannedSuccessorAsync, type IConnectOrStartDaemonOptions } from './connectOrStartDaemon';
import { captureDaemonRequest } from './captureDaemonRequest';
import type { DaemonClient, DaemonClientOutcome, IDaemonClientExecuteOptions } from './DaemonClient';
import { DaemonClientError } from './DaemonClientError';
import {
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
 * A daemon restart that a request followed.
 * @beta
 */
export interface IDaemonRestartNotice {
  /** 1 for the first restart that the request followed. */
  readonly restart: number;
  /** Why the previous daemon asked for the restart; `undefined` when it did not say. */
  readonly reason: DaemonRestartReason | undefined;
  /** The process ID of the daemon that the request is sent to next. */
  readonly successorPid: number | undefined;
}

/**
 * Options for {@link executeWithDaemonRestartAsync}.
 * @beta
 */
export interface IExecuteWithDaemonRestartOptions extends IDaemonClientExecuteOptions {
  /** Called after a successor daemon is ready, before the request is sent to it. */
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
 * Executes on a ready client, retrying only for a typed pre-execution restart.
 * Preserves the original request, callbacks and unread input; never retries connection loss.
 * Restarts are retried with jittered backoff inside the request's explicit admission deadline, if any (a
 * client-default timeout applies to each daemon separately); once the retries or the deadline are exhausted,
 * a `fallback` outcome lets the caller run in-process instead.
 * The connection options must select the request's expected daemon and startup environment.
 * A connection lost before the result is reported as a `disconnected` error that says whether the daemon
 * process exited, what its launcher log recorded and how to recover, unless the request was aborted first.
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
  let owner: IDaemonLockfile | undefined = await attestOwnerAsync(client, connection);
  let outcome: DaemonClientOutcome = await executeOnDaemonAsync(client, connection, {
    ...execution,
    abortSignal
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
      const getRemainingMs = (): number | undefined =>
        waitTimeoutMs === undefined ? undefined : waitTimeoutMs - (Date.now() - startedAt);
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
        if (
          abortSignal?.aborted &&
          (error === abortSignal.reason ||
            (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ABORT_ERR'))
        ) {
          return abortedOutcome(execution);
        }
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
      await onRestartAsync?.({ restart: retry, reason, successorPid: (await successor.status).pid });
      outcome = await executeOnDaemonAsync(successor, connection, {
        ...execution,
        abortSignal,
        request:
          remainingMs === undefined
            ? execution.request
            : captureDaemonRequest({
                ...execution.request,
                admission: { ...execution.request.admission, waitTimeoutMs: Math.floor(remainingMs) }
              })
      });
    }
    return outcome;
  } finally {
    await previous?.closeAsync().catch(() => undefined);
  }
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
    throw await explainLostConnectionAsync(error, daemon, execution.request);
  }
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
