// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as net from 'node:net';

import type { IDaemonProtocolVersion } from '@rushstack/rush-daemon-protocol';

import { DaemonFrameConnection } from './DaemonFrameConnection';
import { listenWithReclaimAsync } from './DaemonListenerBinding';
import { DaemonListenerLifetime } from './DaemonListenerLifetime';
import { ensureDaemonRuntimeDir, writeDaemonLockfile } from './DaemonLockfile';
import { assertDaemonOwnershipAvailable } from './DaemonOwnership';
import type { IDaemonPaths } from './DaemonPaths';

/** Options for {@link DaemonFrameListener.listenAsync}. @beta */
export interface IDaemonListenerOptions {
  /** The wire protocol version this daemon speaks (recorded in the lockfile). */
  readonly protocolVersion: IDaemonProtocolVersion;
  /** The ISO 8601 start time recorded in the lockfile. Defaults to now. */
  readonly startedAt?: string;
  /** Invoked for each newly connected client. */
  readonly onConnection: (connection: DaemonFrameConnection) => void;
}

/** The daemon-side framed listener bound to a workspace's socket/pipe path.
 * @remarks
 * Binding reclaims the path from a dead daemon automatically (see
 * {@link reclaimStaleDaemonAsync}); when a live daemon owns the path, a typed
 * `daemonAlreadyRunning` transport error is thrown.
 * @beta */
export class DaemonFrameListener {
  readonly #lifetime: DaemonListenerLifetime;
  private constructor(server: net.Server, paths: IDaemonPaths) {
    this.#lifetime = new DaemonListenerLifetime(server, paths);
  }
  /** Binds the socket/pipe path and writes the PID lockfile. */
  public static async listenAsync(
    paths: IDaemonPaths,
    options: IDaemonListenerOptions
  ): Promise<DaemonFrameListener> {
    assertDaemonOwnershipAvailable(paths.lockfilePath);
    const server: net.Server = net.createServer((socket: net.Socket) => {
      options.onConnection(new DaemonFrameConnection(socket));
    });
    ensureDaemonRuntimeDir(paths);
    await listenWithReclaimAsync(server, paths);
    // Lockfile after bind: a pre-existing stale record must read as dead, not
    // as a live owner that would make reclaim refuse.
    try {
      writeListenerLockfile(paths, options);
    } catch (error) {
      await new DaemonListenerLifetime(server, paths).stopAcceptingAsync();
      throw error;
    }
    return new DaemonFrameListener(server, paths);
  }

  /** Stops accepting connections and releases the socket/pipe and lockfile. */
  public closeAsync(): Promise<void> {
    return this.#lifetime.closeAsync();
  }
  /** Stops accepting clients and awaits existing connections while retaining daemon ownership. */
  public stopAcceptingAsync(): Promise<void> {
    return this.#lifetime.stopAcceptingAsync();
  }
}

function writeListenerLockfile(paths: IDaemonPaths, options: IDaemonListenerOptions): void {
  writeDaemonLockfile(paths.lockfilePath, {
    pid: process.pid,
    protocolVersion: options.protocolVersion,
    startedAt: options.startedAt ?? new Date().toISOString(),
    socketPath: paths.socketPath
  });
}
