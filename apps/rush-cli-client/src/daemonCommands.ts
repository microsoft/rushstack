// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { Rush } from '@microsoft/rush-lib';
import {
  DaemonClient,
  DaemonClientError,
  connectOrStartDaemonAsync,
  type IConnectOrStartDaemonOptions
} from '@rushstack/rush-client-core';
import { DAEMON_LIFECYCLE_PROTOCOL_MINOR } from '@rushstack/rush-daemon-protocol';

import { getDaemonConnectionOptions } from './daemonConnectionOptions';
import { writeStreamAsync } from './writeStreamAsync';

export interface IDaemonCommandOptions {
  readonly argv: ReadonlyArray<string>;
  readonly environment: Readonly<NodeJS.ProcessEnv>;
  readonly rushJsonPath?: string;
  readonly rushVersion: string;
}

export async function executeDaemonCommandAsync(options: IDaemonCommandOptions): Promise<void> {
  const command: string | undefined = options.argv[0];
  if (command === 'graph') {
    throw new Error(
      options.environment.RUSH_DAEMON_EXPERIMENTAL !== '1'
        ? 'Experimental graph commands require RUSH_DAEMON_EXPERIMENTAL=1 and host graph protocol support.'
        : 'The host graph protocol is not available in this build.'
    );
  }
  if (command === 'logs') throw new Error('daemon logs requires a host log-stream subscription contract.');
  if (
    options.argv.length !== 1 ||
    (command !== 'start' && command !== 'status' && command !== 'stop' && command !== 'restart')
  ) {
    throw new Error('Usage: rush-client daemon start|status|stop|restart');
  }
  if (!options.rushJsonPath) throw new Error('Daemon management requires a repository containing rush.json.');
  const mayStart: boolean = command === 'start' || command === 'restart';
  if (mayStart && options.rushVersion !== Rush.version) {
    throw new Error(
      `Selected Rush ${options.rushVersion} has no version-selected daemon launcher; this client bundles Rush ${Rush.version}.`
    );
  }
  const connectionOptions: IConnectOrStartDaemonOptions = getDaemonConnectionOptions(
    path.dirname(options.rushJsonPath),
    options.rushVersion,
    options.environment,
    mayStart
  );
  // Status observes the selected endpoint, including a compatible daemon from a different client version.
  // It never starts a process or trusts a PID file as evidence of readiness.
  const client: DaemonClient =
    command === 'start'
      ? await connectOrStartDaemonAsync(connectionOptions)
      : await DaemonClient.connectAsync({ socketPath: connectionOptions.paths.socketPath });
  try {
    if (command === 'stop') {
      await client.shutdownAsync();
      await writeStatusAsync({
        state: 'shutdownAccepted',
        socketPath: connectionOptions.paths.socketPath
      });
      return;
    }
    const readyClient: DaemonClient =
      command === 'restart' ? await restartDaemonAsync(client, connectionOptions) : client;
    try {
      await writeStatusAsync({
        state: 'ready',
        socketPath: connectionOptions.paths.socketPath,
        ...(await readyClient.status)
      });
    } finally {
      if (readyClient !== client) await readyClient.closeAsync();
    }
  } finally {
    await client.closeAsync();
  }
}

async function restartDaemonAsync(
  client: DaemonClient,
  options: IConnectOrStartDaemonOptions
): Promise<DaemonClient> {
  if (client.protocolVersion.minor < DAEMON_LIFECYCLE_PROTOCOL_MINOR) {
    throw new DaemonClientError('versionMismatch', 'Daemon restart requires protocol 0.6 or newer.');
  }
  const { pid } = await client.status;
  if (pid === undefined || !Number.isSafeInteger(pid) || pid <= 0) {
    throw new DaemonClientError(
      'startupFailed',
      'The daemon must report a positive PID before safe restart is possible.'
    );
  }
  await client.shutdownAsync();
  return await connectOrStartDaemonAsync({ ...options, previousDaemonPid: pid });
}

function writeStatusAsync(status: object): Promise<void> {
  return writeStreamAsync(process.stdout, Buffer.from(`${JSON.stringify(status)}\n`));
}
