// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import {
  DaemonClient,
  connectOrStartDaemonAsync,
  inspectDaemonStartupReservation,
  requestDaemonShutdownAsync,
  resetDaemonArtifactsAsync,
  resolveDaemonStartupReservationAsync,
  type IConnectOrStartDaemonOptions,
  type IDaemonStartupReservationInfo
} from '@rushstack/rush-client-core';
import {
  DaemonTransportError,
  DaemonTransportErrorCode,
  isDaemonProcessAlive,
  readDaemonLockfile,
  type IDaemonLockfile,
  type IDaemonPaths
} from '@rushstack/rush-daemon-transport';
import type { IDaemonPongMessage, IDaemonRequestAdmissionOptions } from '@rushstack/rush-daemon-protocol';

import { getDaemonConnectionOptionsAsync } from './daemonConnectionOptions';
import { printDaemonLogAsync } from './daemonLogs';
import { executeDaemonGraphCommandAsync } from './daemonGraph';
import { writeStreamAsync } from './writeStreamAsync';

const FORCE_STOP_WAIT_MS: number = 15000;

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
    throw new Error(
      'Daemon admission controls apply to command execution or graph requests, not lifecycle commands.'
    );
  }
  if (command === 'graph') {
    await executeDaemonGraphCommandAsync(options);
    return;
  }
  if (
    (options.argv.length !== 1 &&
      !(
        options.argv.length === 2 &&
        ((command === 'logs' && options.argv[1] === '--follow') ||
          (command === 'stop' && options.argv[1] === '--force'))
      )) ||
    (command !== 'start' &&
      command !== 'status' &&
      command !== 'stop' &&
      command !== 'restart' &&
      command !== 'logs')
  ) {
    throw new Error('Usage: rush-client daemon start|status|stop [--force]|restart|logs [--follow]');
  }
  if (!options.rushJsonPath) throw new Error('Daemon management requires a repository containing rush.json.');
  const mayStart: boolean = command === 'start' || command === 'restart';
  const connectionOptions: IConnectOrStartDaemonOptions = await getDaemonConnectionOptionsAsync(
    path.dirname(options.rushJsonPath),
    options.rushVersion,
    options.environment,
    mayStart
  );
  if (command === 'logs') {
    if (options.argv[1] !== '--follow') {
      await printDaemonLogAsync(connectionOptions.paths);
      return;
    }
    const abort: AbortController = new AbortController();
    const onSignal = (): void => abort.abort(new Error('Daemon log following cancelled.'));
    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);
    try {
      await printDaemonLogAsync(connectionOptions.paths, { follow: true, abortSignal: abort.signal });
    } finally {
      process.removeListener('SIGINT', onSignal);
      process.removeListener('SIGTERM', onSignal);
    }
    // Node's process.stdout cannot be destroyed like an ordinary Writable. The log file is closed first.
    if (abort.signal.aborted) process.exit(130);
    return;
  }
  // Status observes the selected endpoint, including a compatible daemon from a different client version.
  // It never starts a process or trusts a PID file as evidence of readiness.
  const client: DaemonClient | undefined =
    command === 'start'
      ? await connectOrStartDaemonAsync(connectionOptions)
      : await connectExistingAsync(connectionOptions, command !== 'status');
  if (!client) {
    if (command === 'restart') {
      // Nothing to shut down: restart behaves like start.
      const started: DaemonClient = await connectOrStartDaemonAsync(connectionOptions);
      try {
        await writeReadyStatusAsync(connectionOptions.paths, await started.status);
      } finally {
        await started.closeAsync();
      }
      return;
    }
    const { removedPaths } =
      options.argv[1] === '--force'
        ? await resetDaemonArtifactsAsync(connectionOptions.paths)
        : { removedPaths: [] };
    await writeStatusAsync({
      state: removedPaths.length > 0 ? 'reset' : 'notRunning',
      socketPath: connectionOptions.paths.socketPath,
      ...(options.argv[1] === '--force' ? { removedPaths } : {}),
      ...getStartupReservationStatus(connectionOptions.paths)
    });
    return;
  }
  try {
    if (command === 'stop') {
      if (options.argv[1] !== '--force') {
        // Once the daemon is gone, nothing proves a remaining reservation stale, so it would refuse every later
        // automatic start. A reservation that cannot be resolved is still reported; --force removes it below.
        await resolveDaemonStartupReservationAsync(client, connectionOptions.paths).catch(() => false);
      }
      const { activeRequests } = await client.shutdownAsync();
      if (activeRequests) {
        await writeStreamAsync(
          process.stderr,
          Buffer.from(
            `rush-client: the daemon was running ${activeRequests} request(s); they were cancelled.\n`
          )
        );
      }
      const cancelled: { cancelledRequests?: number } =
        activeRequests === undefined ? {} : { cancelledRequests: activeRequests };
      if (options.argv[1] === '--force') {
        // Wait for the acknowledged daemon to release its listener and record, then clear leftovers
        // such as an abandoned startup reservation in the same invocation.
        const { removedPaths } = await resetDaemonArtifactsAsync(connectionOptions.paths, {
          waitTimeoutMs: FORCE_STOP_WAIT_MS
        });
        await writeStatusAsync({
          state: 'shutdownAccepted',
          socketPath: connectionOptions.paths.socketPath,
          ...cancelled,
          removedPaths
        });
        return;
      }
      await writeStatusAsync({
        state: 'shutdownAccepted',
        socketPath: connectionOptions.paths.socketPath,
        ...cancelled,
        ...getStartupReservationStatus(connectionOptions.paths)
      });
      return;
    }
    const readyClient: DaemonClient =
      command === 'restart' ? await restartDaemonAsync(client, connectionOptions) : client;
    try {
      await writeReadyStatusAsync(connectionOptions.paths, await readyClient.status);
    } finally {
      if (readyClient !== client) await readyClient.closeAsync();
    }
  } finally {
    await client.closeAsync();
  }
}

/** Returns undefined when nothing listens at the endpoint and `allowAbsent` is set; other failures propagate. */
async function connectExistingAsync(
  options: IConnectOrStartDaemonOptions,
  allowAbsent: boolean
): Promise<DaemonClient | undefined> {
  try {
    return await DaemonClient.connectAsync({ socketPath: options.paths.socketPath });
  } catch (error) {
    if (
      allowAbsent &&
      error instanceof DaemonTransportError &&
      error.code === DaemonTransportErrorCode.connectionRefused
    ) {
      return undefined;
    }
    throw explainStartupReservation(explainExitedDaemon(error, options.paths), options.paths);
  }
}

/**
 * Explains a refused connection whose ownership record names a daemon that no longer runs. An orderly
 * shutdown removes the record, so that daemon exited without shutting down, for example after a crash.
 */
function explainExitedDaemon(error: unknown, paths: IDaemonPaths): unknown {
  if (!(error instanceof DaemonTransportError) || error.code !== DaemonTransportErrorCode.connectionRefused) {
    return error;
  }
  const owner: IDaemonLockfile | undefined = readDaemonLockfile(paths.lockfilePath);
  if (
    owner?.socketPath !== paths.socketPath ||
    !Number.isSafeInteger(owner.pid) ||
    owner.pid <= 0 ||
    isDaemonProcessAlive(owner.pid)
  ) {
    return error;
  }
  return new DaemonTransportError(
    error.code,
    `${error.message} rushd (PID ${owner.pid}) exited without shutting down; "rush-client daemon logs" may show why.`
  );
}

/**
 * Reports a startup reservation, which refuses another daemon launch until it is resolved. Clients resolve it
 * once the daemon it reserved is ready, so the next command that uses, stops or restarts a ready daemon resolves
 * a remaining one; status only reports it.
 */
function getStartupReservationStatus(paths: IDaemonPaths): {
  startupReservation?: IDaemonStartupReservationInfo;
} {
  const startupReservation: IDaemonStartupReservationInfo | undefined =
    inspectDaemonStartupReservation(paths);
  return startupReservation ? { startupReservation } : {};
}

/** Explains that a remaining startup reservation refuses another daemon launch, and what can resolve it. */
function explainStartupReservation(error: unknown, paths: IDaemonPaths): unknown {
  const reservation: IDaemonStartupReservationInfo | undefined = inspectDaemonStartupReservation(paths);
  if (!reservation || !(error instanceof Error)) return error;
  const helper: string = `its startup helper (PID ${reservation.helperPid})`;
  let explanation: string;
  switch (reservation.helperState) {
    case 'running':
      explanation = `A daemon is starting: ${helper} is still waiting for it to become ready; retry shortly.`;
      break;
    case 'exited':
      explanation = `The startup reservation at ${reservation.path} remains, but ${helper} exited before the daemon became ready, so the reservation refuses every automatic start unless that daemon still becomes ready. Check "rush-client daemon logs"; if the daemon failed to start, run "rush-client daemon stop --force" to remove it.`;
      break;
    default:
      explanation = `The startup reservation at ${reservation.path} refuses another daemon launch. Check "rush-client daemon logs"; if no daemon is starting, run "rush-client daemon stop --force" to remove it.`;
  }
  return new Error(`${error.message} ${explanation}`, { cause: error });
}

async function restartDaemonAsync(
  client: DaemonClient,
  options: IConnectOrStartDaemonOptions
): Promise<DaemonClient> {
  const previousDaemon: Pick<IDaemonLockfile, 'pid' | 'startedAt'> = await requestDaemonShutdownAsync(
    client,
    options.paths
  );
  return await connectOrStartDaemonAsync({ ...options, previousDaemon });
}

function writeStatusAsync(status: object): Promise<void> {
  return writeStreamAsync(process.stdout, Buffer.from(`${JSON.stringify(status)}\n`));
}

/** A daemon whose installation was removed or replaced still answers, but restarts on its next request. */
async function writeReadyStatusAsync(
  paths: IDaemonPaths,
  status: IDaemonPongMessage['payload']
): Promise<void> {
  const change: IDaemonPongMessage['payload']['installationChange'] = status.installationChange;
  await writeStatusAsync({
    state: change ? 'installationChanged' : 'ready',
    socketPath: paths.socketPath,
    ...status,
    ...getStartupReservationStatus(paths)
  });
  if (!change) return;
  process.exitCode = 1;
  await writeStreamAsync(
    process.stderr,
    Buffer.from(
      `rush-client: The daemon's installation at ${change.folder} was ${change.change}. ` +
        'The next command restarts the daemon, or run "rush-client daemon restart".\n'
    )
  );
}
