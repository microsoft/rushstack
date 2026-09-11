// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { DAEMON_WORKSPACE_RESTART_PROTOCOL_MINOR } from '@rushstack/rush-daemon-protocol';
import { readDaemonLockfile, type IDaemonLockfile } from '@rushstack/rush-daemon-transport';

import { connectOrStartDaemonAsync, type IConnectOrStartDaemonOptions } from './connectOrStartDaemon';
import { captureDaemonRequest } from './captureDaemonRequest';
import type { DaemonClient, DaemonClientOutcome, IDaemonClientExecuteOptions } from './DaemonClient';
import { DaemonClientError } from './DaemonClientError';

/**
 * Executes on a ready client, retrying once only for a typed pre-execution restart.
 * Preserves the original request, callbacks and unread input; never retries connection loss.
 * The connection options must select the request's expected daemon and startup environment.
 * @beta
 */
export async function executeWithDaemonRestartAsync(
  client: DaemonClient,
  connection: IConnectOrStartDaemonOptions,
  execution: IDaemonClientExecuteOptions
): Promise<DaemonClientOutcome> {
  const startedAt: number = Date.now();
  const abortSignal: AbortSignal | undefined = execution.abortSignal && connection.abortSignal
    ? AbortSignal.any([execution.abortSignal, connection.abortSignal])
    : execution.abortSignal ?? connection.abortSignal;
  const owner: IDaemonLockfile | undefined = readDaemonLockfile(connection.paths.lockfilePath);
  const { pid } = await client.status;
  const attested: boolean =
    client.protocolVersion.minor >= DAEMON_WORKSPACE_RESTART_PROTOCOL_MINOR &&
    owner !== undefined && owner.pid === pid && owner.socketPath === connection.paths.socketPath &&
    Number.isSafeInteger(owner.pid) && owner.pid > 0 && Number.isFinite(Date.parse(owner.startedAt));
  const outcome: DaemonClientOutcome = await client.executeAsync({ ...execution, abortSignal });
  if (outcome.kind !== 'result' || !outcome.result.retryAfterRestart) return outcome;
  if (!attested || !owner) {
    throw new DaemonClientError(
      'startupFailed', 'Cannot attest the restarting daemon ownership; the request was not retried.'
    );
  }
  if (abortSignal?.aborted) return abortedOutcome(execution);
  let successor: DaemonClient;
  try {
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
  }
  const waitTimeoutMs: number | undefined = execution.request.admission?.waitTimeoutMs;
  const result: DaemonClientOutcome = await successor.executeAsync({
    ...execution,
    abortSignal,
    request: waitTimeoutMs === undefined ? execution.request : captureDaemonRequest({
      ...execution.request,
      admission: {
        ...execution.request.admission,
        waitTimeoutMs: Math.max(0, waitTimeoutMs - (Date.now() - startedAt))
      }
    })
  });
  if (result.kind === 'result' && result.result.retryAfterRestart) {
    throw new DaemonClientError(
      'startupFailed', 'The successor requested another restart; the single safe retry was exhausted.'
    );
  }
  return result;
}

function abortedOutcome(execution: IDaemonClientExecuteOptions): DaemonClientOutcome {
  return {
    kind: 'result',
    result: { requestId: execution.request.requestId, exitCode: 130, outcome: 'aborted', aborted: true }
  };
}
