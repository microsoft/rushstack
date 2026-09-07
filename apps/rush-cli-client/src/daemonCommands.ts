// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { Rush } from '@microsoft/rush-lib';
import {
  DaemonClient,
  connectOrStartDaemonAsync,
  requestDaemonShutdownAsync,
  type IConnectOrStartDaemonOptions
} from '@rushstack/rush-client-core';
import type { IDaemonLockfile } from '@rushstack/rush-daemon-transport';
import type { IDaemonRequestAdmissionOptions } from '@rushstack/rush-daemon-protocol';

import { getDaemonConnectionOptions } from './daemonConnectionOptions';
import { printDaemonLogAsync } from './daemonLogs';
import { executeDaemonGraphCommandAsync } from './daemonGraph';
import { writeStreamAsync } from './writeStreamAsync';

export interface IDaemonCommandOptions {
  readonly argv: ReadonlyArray<string>;
  readonly environment: Readonly<NodeJS.ProcessEnv>;
  readonly rushJsonPath?: string;
  readonly rushVersion: string;
  readonly admission?: IDaemonRequestAdmissionOptions;
}

export async function executeDaemonCommandAsync(options: IDaemonCommandOptions): Promise<void> {
  const command: string | undefined = options.argv[0];
  if (options.admission && command !== 'graph') {
    throw new Error('Daemon admission controls apply to command execution or graph requests, not lifecycle commands.');
  }
  if (command === 'graph') {
    await executeDaemonGraphCommandAsync(options);
    return;
  }
  if (
    options.argv.length !== 1 ||
    (command !== 'start' &&
      command !== 'status' &&
      command !== 'stop' &&
      command !== 'restart' &&
      command !== 'logs')
  ) {
    throw new Error('Usage: rush-client daemon start|status|stop|restart|logs');
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
  if (command === 'logs') {
    await printDaemonLogAsync(connectionOptions.paths);
    return;
  }
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
  const previousDaemon: Pick<IDaemonLockfile, 'pid' | 'startedAt'> =
    await requestDaemonShutdownAsync(client, options.paths);
  return await connectOrStartDaemonAsync({ ...options, previousDaemon });
}

function writeStatusAsync(status: object): Promise<void> {
  return writeStreamAsync(process.stdout, Buffer.from(`${JSON.stringify(status)}\n`));
}
