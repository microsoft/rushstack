// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { setTimeout as delayAsync } from 'node:timers/promises';

import { DAEMON_WORKSPACE_RESTART_PROTOCOL_MINOR } from '@rushstack/rush-daemon-protocol';
import { readDaemonLockfile, type IDaemonLockfile } from '@rushstack/rush-daemon-transport';

import { connectOrStartDaemonAsync, type IConnectOrStartDaemonOptions } from './connectOrStartDaemon';
import { captureDaemonRequest } from './captureDaemonRequest';
import type { DaemonClient, DaemonClientOutcome, IDaemonClientExecuteOptions } from './DaemonClient';
import { DaemonClientError } from './DaemonClientError';

/**
 * The maximum number of successors a single request follows. Each restart serves at least one other
 * environment first, so this bounds the wait when several environments share one workspace daemon.
 */
const MAX_RESTART_RETRIES: number = 6;
const RETRY_JITTER_BASE_MS: number = 50;
const RETRY_JITTER_MAX_MS: number = 1000;

/**
 * Executes on a ready client, retrying only for a typed pre-execution restart.
 * Preserves the original request, callbacks and unread input; never retries connection loss.
 * Restarts are retried with jittered backoff inside the request's admission deadline; once the
 * retries or the deadline are exhausted, a `fallback` outcome lets the caller run in-process instead.
 * The connection options must select the request's expected daemon and startup environment.
 * @beta
 */
export async function executeWithDaemonRestartAsync(
  client: DaemonClient,
  connection: IConnectOrStartDaemonOptions,
  execution: IDaemonClientExecuteOptions
): Promise<DaemonClientOutcome> {
  const startedAt: number = Date.now();
  const abortSignal: AbortSignal | undefined =
    execution.abortSignal && connection.abortSignal
      ? AbortSignal.any([execution.abortSignal, connection.abortSignal])
      : (execution.abortSignal ?? connection.abortSignal);
  const waitTimeoutMs: number | undefined = execution.request.admission?.waitTimeoutMs;
  let owner: IDaemonLockfile | undefined = await attestOwnerAsync(client, connection);
  let outcome: DaemonClientOutcome = await client.executeAsync({ ...execution, abortSignal });
  let previous: DaemonClient | undefined;
  for (let retry: number = 1; outcome.kind === 'result' && outcome.result.retryAfterRestart; retry++) {
    if (!owner) {
      throw new DaemonClientError(
        'startupFailed',
        'Cannot attest the restarting daemon ownership; the request was not retried.'
      );
    }
    if (abortSignal?.aborted) return abortedOutcome(execution);
    const remainingMs: number | undefined =
      waitTimeoutMs === undefined ? undefined : waitTimeoutMs - (Date.now() - startedAt);
    if (retry > MAX_RESTART_RETRIES || (remainingMs !== undefined && remainingMs <= 0)) {
      return restartExhaustedOutcome(retry - 1);
    }
    let successor: DaemonClient;
    try {
      // The first retry follows the planned successor immediately; later ones back off with jitter so
      // clients whose environments differ do not reach each new successor in lockstep.
      if (retry > 1) await delayAsync(getRetryDelayMs(retry, remainingMs), undefined, { signal: abortSignal });
      successor = await connectOrStartDaemonAsync({
        ...connection,
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
      throw error;
    } finally {
      await previous?.closeAsync().catch(() => undefined);
      previous = undefined;
    }
    owner = await attestOwnerAsync(successor, connection);
    outcome = await successor.executeAsync({
      ...execution,
      abortSignal,
      request:
        waitTimeoutMs === undefined
          ? execution.request
          : captureDaemonRequest({
              ...execution.request,
              admission: {
                ...execution.request.admission,
                waitTimeoutMs: Math.max(0, waitTimeoutMs - (Date.now() - startedAt))
              }
            })
    });
    previous = successor;
  }
  return outcome;
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