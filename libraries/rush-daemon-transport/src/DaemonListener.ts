// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as net from 'node:net';

import type { IDaemonProtocolVersion } from '@rushstack/rush-daemon-protocol';

import { DaemonFrameConnection } from './DaemonFrameConnection';
import { ADDRESS_IN_USE, listenOrErrorAsync, toListenTransportError } from './DaemonListenerNet';
import type { INetError } from './DaemonListenerNet';
import { ensureDaemonRuntimeDir, removeDaemonArtifacts, writeDaemonLockfile } from './DaemonLockfile';
import type { IDaemonPaths } from './DaemonPaths';
import { reclaimStaleDaemonAsync } from './DaemonReclaim';

const FIRST_ATTEMPT: number = 0;
const RECLAIM_ATTEMPT: number = 1;

/** Options for {@link DaemonFrameListener.listenAsync}. @beta */
export interface IDaemonListenerOptions {
  /** The wire protocol version this daemon speaks (recorded in the lockfile). */
  readonly protocolVersion: IDaemonProtocolVersion;
  /** The ISO 8601 start time recorded in the lockfile. Defaults to now. */
  readonly startedAt?: string;
  /** Invoked for each newly connected client. */
  readonly onConnection: (connection: DaemonFrameConnection) => void;
}

/**
 * The daemon-side framed listener bound to a workspace's socket/pipe path.
 *
 * @remarks
 * Binding reclaims the path from a dead daemon automatically (see
 * {@link reclaimStaleDaemonAsync}); when a live daemon owns the path, a typed
 * `daemonAlreadyRunning` transport error is thrown.
 * @beta
 */
export class DaemonFrameListener {
  private readonly _server: net.Server;
  private readonly _paths: IDaemonPaths;
  private constructor(server: net.Server, paths: IDaemonPaths) {
    this._server = server;
    this._paths = paths;
  }
  /** Binds the socket/pipe path and writes the PID lockfile. */
  public static async listenAsync(
    paths: IDaemonPaths,
    options: IDaemonListenerOptions
  ): Promise<DaemonFrameListener> {
    const server: net.Server = net.createServer((socket: net.Socket) => {
      options.onConnection(new DaemonFrameConnection(socket));
    });
    ensureDaemonRuntimeDir(paths);
    await listenWithReclaimAsync(server, paths);
    writeDaemonLockfile(paths.lockfilePath, {
      pid: process.pid,
      protocolVersion: options.protocolVersion,
      startedAt: options.startedAt ?? new Date().toISOString(),
      socketPath: paths.socketPath
    });
    return new DaemonFrameListener(server, paths);
  }

  /** Stops accepting connections and releases the socket/pipe and lockfile. */
  public async closeAsync(): Promise<void> {
    await new Promise<void>((resolve: () => void) => this._server.close(() => resolve()));
    removeDaemonArtifacts(this._paths.lockfilePath, this._paths.socketPath);
  }
}


async function listenWithReclaimAsync(server: net.Server, paths: IDaemonPaths): Promise<void> {
  for (let attempt: number = FIRST_ATTEMPT; attempt <= RECLAIM_ATTEMPT; attempt++) {
    const bound: boolean = await tryListenOnceAsync(server, paths, attempt);
    if (bound) {
      return;
    }
  }
}

async function tryListenOnceAsync(
  server: net.Server,
  paths: IDaemonPaths,
  attempt: number
): Promise<boolean> {
  const error: INetError | undefined = await listenOrErrorAsync(server, paths.socketPath);
  return error ? recoverFromListenErrorAsync(error, paths, attempt) : true;
}

async function recoverFromListenErrorAsync(
  error: INetError,
  paths: IDaemonPaths,
  attempt: number
): Promise<boolean> {
  const canReclaim: boolean = error.code === ADDRESS_IN_USE && attempt === FIRST_ATTEMPT;
  if (!canReclaim) {
    throw toListenTransportError(error, paths.socketPath);
  }
  await reclaimStaleDaemonAsync(paths);
  return false;
}
