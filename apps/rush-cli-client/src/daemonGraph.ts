// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import {
  captureDaemonRequest, DaemonClient, type DaemonClientOutcome, type IConnectOrStartDaemonOptions
} from '@rushstack/rush-client-core';
import { isDaemonControlRecord, RUSHD_GRAPH_SNAPSHOT, type IDaemonRequestEnvelope } from '@rushstack/rush-daemon-protocol';

import type { IDaemonCommandOptions } from './daemonCommands';
import { getDaemonConnectionOptions } from './daemonConnectionOptions';
import { writeStreamAsync } from './writeStreamAsync';

/** The reference graph client has no renderer, native graph imports, or in-process fallback. */
export async function executeDaemonGraphCommandAsync(options: IDaemonCommandOptions): Promise<void> {
  try {
    await runGraphAsync(options);
  } catch (error) {
    process.exitCode = 1;
    await writeJsonAsync({ kind: 'graphError', message: error instanceof Error ? error.message : String(error) });
  }
}

async function runGraphAsync(options: IDaemonCommandOptions): Promise<void> {
  if (options.environment.RUSH_DAEMON_EXPERIMENTAL !== '1') {
    throw new Error('Graph commands require RUSH_DAEMON_EXPERIMENTAL=1.');
  }
  if (!options.rushJsonPath) throw new Error('Graph commands require a repository containing rush.json.');
  const request: IDaemonRequestEnvelope = captureDaemonRequest({
    argv: ['daemon', ...options.argv],
    commandName: 'daemon',
    commandOrigin: 'built-in',
    cwd: process.cwd(),
    environment: options.environment,
    admission: options.admission,
    terminal: { isTTY: false, supportsColor: false, acceptsStdin: false }
  });
  const connection: IConnectOrStartDaemonOptions = getDaemonConnectionOptions(
    path.dirname(options.rushJsonPath), options.rushVersion, options.environment, false
  );
  // Like daemon status, graph inspection connects only. Starting a daemon is an explicit management command.
  const client: DaemonClient = await DaemonClient.connectAsync({
    socketPath: connection.paths.socketPath,
    capabilities: { isTTY: false, colorLevel: 0 }
  });
  const abort: AbortController = new AbortController();
  const onSignal = (): void => abort.abort();
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
  let sawSnapshot: boolean = false;
  let outcome: DaemonClientOutcome;
  try {
    outcome = await client.executeAsync({
      request,
      abortSignal: abort.signal,
      onEventAsync: async (event) => {
        const payload: unknown = event.payload;
        if (
          event.type !== 'extension' || !isDaemonControlRecord(payload) || payload.name !== RUSHD_GRAPH_SNAPSHOT ||
          !isDaemonControlRecord(payload.data) || payload.data.requestId !== request.requestId ||
          !isDaemonControlRecord(payload.data.snapshot) || typeof payload.data.snapshot.initialized !== 'boolean'
        ) {
          throw new Error('The daemon sent an invalid graph snapshot event.');
        }
        sawSnapshot = true;
        await writeJsonAsync(event);
      },
      onQueuePositionAsync: (position) =>
        writeJsonAsync({ kind: 'queuePosition', payload: { requestId: request.requestId, position } })
    });
  } finally {
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
    await client.closeAsync();
  }
  if (outcome.kind === 'fallback') {
    throw new Error(`The daemon does not support graph requests: ${outcome.message ?? outcome.reason}. No native fallback was attempted.`);
  }
  if (outcome.kind === 'rejected') {
    process.exitCode = 1;
    await writeJsonAsync({ kind: 'requestRejected', payload: outcome.rejection });
    return;
  }
  if (outcome.result.outcome === 'success' && !sawSnapshot) {
    throw new Error('The daemon completed without a graph snapshot; graph support is required. No native fallback was attempted.');
  }
  process.exitCode = outcome.result.exitCode;
  await writeJsonAsync({ kind: 'requestResult', payload: outcome.result });
}

function writeJsonAsync(value: object): Promise<void> {
  return writeStreamAsync(process.stdout, Buffer.from(`${JSON.stringify(value)}\n`));
}
