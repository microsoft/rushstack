// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { Rush } from '@microsoft/rush-lib';
import {
  DaemonClient,
  connectOrStartDaemonAsync,
  type IConnectOrStartDaemonOptions
} from '@rushstack/rush-client-core';

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
  if (command === 'stop' || command === 'restart') {
    throw new Error(`daemon ${command} requires negotiated host lifecycle controls; no PID was signaled.`);
  }
  if (command === 'logs') throw new Error('daemon logs requires a host log-stream subscription contract.');
  if (options.argv.length !== 1 || (command !== 'start' && command !== 'status')) {
    throw new Error('Usage: rush-client daemon start|status');
  }
  if (!options.rushJsonPath) throw new Error('Daemon management requires a repository containing rush.json.');
  if (command === 'start' && options.rushVersion !== Rush.version) {
    throw new Error(
      `Selected Rush ${options.rushVersion} has no version-selected daemon launcher; this client bundles Rush ${Rush.version}.`
    );
  }
  const connectionOptions: IConnectOrStartDaemonOptions = getDaemonConnectionOptions(
    path.dirname(options.rushJsonPath),
    options.rushVersion,
    options.environment,
    command === 'start'
  );
  // Status observes the selected endpoint, including a compatible daemon from a different client version.
  // It never starts a process or trusts a PID file as evidence of readiness.
  const client: DaemonClient =
    command === 'start'
      ? await connectOrStartDaemonAsync(connectionOptions)
      : await DaemonClient.connectAsync({ socketPath: connectionOptions.paths.socketPath });
  try {
    const output: string = JSON.stringify({
      state: 'ready',
      socketPath: connectionOptions.paths.socketPath,
      ...(await client.status)
    });
    await writeStreamAsync(process.stdout, Buffer.from(`${output}\n`));
  } finally {
    await client.closeAsync();
  }
}
