// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import {
  captureDaemonRequest,
  type DaemonClient,
  type DaemonClientOutcome,
  type IConnectOrStartDaemonOptions
} from '@rushstack/rush-client-core';
import {
  DAEMON_GRAPH_GENERATION_PROTOCOL_MINOR,
  isDaemonControlRecord,
  RUSHD_GRAPH_SNAPSHOT,
  type IDaemonRequestEnvelope
} from '@rushstack/rush-daemon-protocol';

import type { IDaemonCommandOptions } from './daemonCommands';
import { getDaemonConnectionOptions } from './daemonConnectionOptions';
import { writeStreamAsync } from './writeStreamAsync';
import {
  parseGraphGenerationControls,
  readGraphGenerationAsync,
  type IGraphGenerationControls
} from './GraphGenerationControls';
import { GraphRequestCancelledError, GraphRequestContext } from './GraphRequestContext';

/** The reference graph client has no renderer, native graph imports, or in-process fallback. */
export async function executeDaemonGraphCommandAsync(options: IDaemonCommandOptions): Promise<void> {
  try {
    await runGraphAsync(options);
  } catch (error) {
    process.exitCode = error instanceof GraphRequestCancelledError ? 130 : 1;
    await writeJsonAsync({
      kind: 'graphError',
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

async function runGraphAsync(options: IDaemonCommandOptions): Promise<void> {
  if (options.environment.RUSH_DAEMON_EXPERIMENTAL !== '1') {
    throw new Error('Graph commands require RUSH_DAEMON_EXPERIMENTAL=1.');
  }
  if (!options.rushJsonPath) throw new Error('Graph commands require a repository containing rush.json.');
  const connection: IConnectOrStartDaemonOptions = getDaemonConnectionOptions(
    path.dirname(options.rushJsonPath),
    options.rushVersion,
    options.environment,
    false
  );
  const controls: IGraphGenerationControls = parseGraphGenerationControls(options.argv);
  if (!options.admission) throw new Error('Graph admission options must be resolved before dispatch.');
  const context: GraphRequestContext = new GraphRequestContext(options.admission);
  try {
    const expectedWorkspaceGeneration: string | undefined = controls.mutation
      ? (controls.generation ?? (await readGraphGenerationAsync(connection, options.environment, context)))
      : undefined;
    // Graph inspection connects only; starting a daemon is a separate management command.
    const client: DaemonClient = await context.connectAsync({
      socketPath: connection.paths.socketPath,
      capabilities: { isTTY: false, colorLevel: 0 }
    });
    try {
      if (controls.mutation && client.protocolVersion.minor < DAEMON_GRAPH_GENERATION_PROTOCOL_MINOR) {
        throw new Error('Graph mutations require generation-aware protocol 0.9 or newer.');
      }
      const request: IDaemonRequestEnvelope = captureDaemonRequest({
        argv: ['daemon', ...controls.argv],
        commandName: 'daemon',
        commandOrigin: 'built-in',
        cwd: process.cwd(),
        environment: options.environment,
        admission: context.admission,
        expectedWorkspaceGeneration,
        terminal: { isTTY: false, supportsColor: false, acceptsStdin: false }
      });
      await executeGraphRequestAsync(client, request, context.signal);
    } finally {
      await client.closeAsync();
    }
  } finally {
    context[Symbol.dispose]();
  }
}

async function executeGraphRequestAsync(
  client: DaemonClient,
  request: IDaemonRequestEnvelope,
  abortSignal: AbortSignal
): Promise<void> {
  const { expectedWorkspaceGeneration } = request;
  let sawSnapshot: boolean = false;
  const outcome: DaemonClientOutcome = await client.executeAsync({
    request,
    abortSignal,
    onEventAsync: async (event) => {
      const payload: unknown = event.payload;
      if (
        event.type !== 'extension' ||
        !isDaemonControlRecord(payload) ||
        payload.name !== RUSHD_GRAPH_SNAPSHOT ||
        !isDaemonControlRecord(payload.data) ||
        payload.data.requestId !== request.requestId ||
        !isDaemonControlRecord(payload.data.snapshot) ||
        typeof payload.data.snapshot.initialized !== 'boolean'
      ) {
        throw new Error('The daemon sent an invalid graph snapshot event.');
      }
      if (
        expectedWorkspaceGeneration !== undefined &&
        payload.data.snapshot.workspaceGeneration !== expectedWorkspaceGeneration
      )
        throw new Error('The graph mutation response belongs to a different workspace generation.');
      sawSnapshot = true;
      await writeJsonAsync(event);
    },
    onQueuePositionAsync: (position) =>
      writeJsonAsync({ kind: 'queuePosition', payload: { requestId: request.requestId, position } })
  });
  if (outcome.kind === 'fallback') {
    throw new Error(
      `The daemon does not support graph requests: ${outcome.message ?? outcome.reason}. No native fallback was attempted.`
    );
  }
  if (outcome.kind === 'rejected') {
    process.exitCode = 1;
    await writeJsonAsync({ kind: 'requestRejected', payload: outcome.rejection });
    return;
  }
  if (outcome.result.outcome === 'success' && !sawSnapshot) {
    throw new Error(
      'The daemon completed without a graph snapshot; graph support is required. No native fallback was attempted.'
    );
  }
  process.exitCode = outcome.result.exitCode;
  await writeJsonAsync({ kind: 'requestResult', payload: outcome.result });
}

function writeJsonAsync(value: object): Promise<void> {
  return writeStreamAsync(process.stdout, Buffer.from(`${JSON.stringify(value)}\n`));
}
