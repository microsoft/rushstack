// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  captureDaemonRequest, DaemonClient, type DaemonClientOutcome, type IConnectOrStartDaemonOptions
} from '@rushstack/rush-client-core';
import {
  DAEMON_GRAPH_GENERATION_PROTOCOL_MINOR,
  isDaemonControlRecord,
  RUSHD_GRAPH_SNAPSHOT,
  type IDaemonRequestEnvelope
} from '@rushstack/rush-daemon-protocol';

export interface IGraphGenerationControls {
  readonly argv: ReadonlyArray<string>;
  readonly mutation: boolean;
  readonly generation?: string;
}

export function parseGraphGenerationControls(argv: ReadonlyArray<string>): IGraphGenerationControls {
  const mutation: boolean = ['scope-in', 'scope-out', 'invalidate', 'pause', 'resume'].includes(argv[1]);
  const remaining: string[] = [];
  let generation: string | undefined;
  for (let i: number = 0; i < argv.length; i++) {
    const arg: string = argv[i];
    if (arg === '--generation' || arg.startsWith('--generation=')) {
      if (!mutation || generation !== undefined) {
        throw new Error('--generation is accepted once, on a graph mutation only.');
      }
      generation = arg === '--generation' ? argv[++i] : arg.slice('--generation='.length);
      if (!generation || generation.trim() !== generation || generation.startsWith('--')) {
        throw new Error('--generation requires the opaque token from a graph snapshot.');
      }
    } else {
      remaining.push(arg);
    }
  }
  return { argv: remaining, mutation, generation };
}

/** Reads a current token without printing a second snapshot or mutating anything. */
export async function readGraphGenerationAsync(
  connection: IConnectOrStartDaemonOptions,
  environment: Readonly<NodeJS.ProcessEnv>
): Promise<string> {
  const client: DaemonClient = await DaemonClient.connectAsync({ socketPath: connection.paths.socketPath });
  try {
    if (client.protocolVersion.minor < DAEMON_GRAPH_GENERATION_PROTOCOL_MINOR) {
      throw new Error('Graph mutations require generation-aware protocol 0.9 or newer.');
    }
    const request: IDaemonRequestEnvelope = captureDaemonRequest({
      argv: ['daemon', 'graph', 'status'], commandName: 'daemon', commandOrigin: 'built-in',
      cwd: process.cwd(), environment, terminal: { isTTY: false, supportsColor: false }
    });
    let generation: string | undefined;
    const outcome: DaemonClientOutcome = await client.executeAsync({
      request,
      onEventAsync: async (event) => {
        const payload: unknown = event.payload;
        if (
          event.type !== 'extension' || !isDaemonControlRecord(payload) ||
          payload.name !== RUSHD_GRAPH_SNAPSHOT || !isDaemonControlRecord(payload.data) ||
          payload.data.requestId !== request.requestId || !isDaemonControlRecord(payload.data.snapshot) ||
          typeof payload.data.snapshot.initialized !== 'boolean'
        ) throw new Error('Invalid graph-generation snapshot.');
        const token: unknown = payload.data.snapshot.workspaceGeneration;
        if (typeof token !== 'string' || token.length === 0) throw new Error('Missing graph generation token.');
        generation = token;
      }
    });
    if (outcome.kind !== 'result' || outcome.result.exitCode !== 0 || generation === undefined) {
      throw new Error('Could not obtain a current graph generation; no mutation was attempted.');
    }
    return generation;
  } finally {
    await client.closeAsync();
  }
}
