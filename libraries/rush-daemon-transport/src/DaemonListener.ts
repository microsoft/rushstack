// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as net from 'node:net';

import type { IDaemonProtocolVersion } from '@rushstack/rush-daemon-protocol';

import type { DaemonFileChange } from './DaemonFileChange';
import { pinFileIdentity } from './DaemonFileIdentity';
import type { IDaemonFileIdentity } from './DaemonFileIdentity';
import { DaemonFrameConnection } from './DaemonFrameConnection';
import { listenWithReclaimAsync } from './DaemonListenerBinding';
import { DaemonListenerLifetime } from './DaemonListenerLifetime';
import type { IDaemonListenerFiles } from './DaemonListenerLifetime';
import { writeDaemonLockfile } from './DaemonLockfile';
import { startOperationGroupRecording } from './DaemonOperationGroupRecorder';
import { getOperationGroupsFolder } from './DaemonOperationGroups';
import { assertDaemonOwnershipAvailable } from './DaemonOwnership';
import type { IDaemonPaths } from './DaemonPaths';
import type { IDaemonReclaimOptions } from './DaemonReclaimOptions';
import { ensureDaemonRuntimeDir } from './DaemonRuntimeDir';

/** Options for {@link DaemonFrameListener.listenAsync}. @beta */
export interface IDaemonListenerOptions extends IDaemonReclaimOptions {
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
  private constructor(server: net.Server, paths: IDaemonPaths, files: IDaemonListenerFiles) {
    // Record detached operation groups for as long as this process owns the lockfile, so a successor can
    // reap them if this daemon dies uncleanly.
    const folder: string = getOperationGroupsFolder(paths.lockfilePath, process.pid);
    this.#lifetime = new DaemonListenerLifetime(server, paths, files, startOperationGroupRecording(folder));
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
    const socket: IDaemonFileIdentity | undefined = await listenWithReclaimAsync(server, paths, options);
    // Lockfile after bind: a pre-existing stale record must read as dead, not
    // as a live owner that would make reclaim refuse.
    let lockfile: IDaemonFileIdentity | undefined;
    try {
      lockfile = writeListenerLockfile(paths, options);
    } catch (error) {
      await new DaemonListenerLifetime(server, paths, { socket }).stopAcceptingAsync();
      throw error;
    }
    return new DaemonFrameListener(server, paths, { socket, lockfile });
  }

  /** Stops accepting connections and releases the socket/pipe and lockfile, unless a successor replaced them. */
  public closeAsync(): Promise<void> {
    return this.#lifetime.closeAsync();
  }
  /** Stops accepting clients and awaits existing connections while retaining daemon ownership. */
  public stopAcceptingAsync(): Promise<void> {
    return this.#lifetime.stopAcceptingAsync();
  }
  /** For a daemon process that exits before its shutdown finished: releases the socket/pipe and lockfile,
   * unless the daemon still has children that a successor must reap. Then both stay, as after a crash.
   * @returns Whether they were released. */
  public releaseForExit(): boolean {
    return this.#lifetime.releaseForExit();
  }
  /** Reports a POSIX socket that was deleted, or whose name another file took: no client can connect then.
   * @returns `undefined` while the socket is intact, on Windows, and after the listener released it. */
  public checkSocket(): DaemonFileChange | undefined {
    return this.#lifetime.checkSocket();
  }
}

function writeListenerLockfile(paths: IDaemonPaths, options: IDaemonListenerOptions): IDaemonFileIdentity {
  writeDaemonLockfile(paths.lockfilePath, {
    pid: process.pid,
    protocolVersion: options.protocolVersion,
    startedAt: options.startedAt ?? new Date().toISOString(),
    socketPath: paths.socketPath
  });
  return pinFileIdentity(paths.lockfilePath);
}
