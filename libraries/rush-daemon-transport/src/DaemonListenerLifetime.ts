// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as net from 'node:net';

import { hasProcessesToReap } from './DaemonExitRelease';
import { compareFileIdentity } from './DaemonFileChange';
import type { DaemonFileChange } from './DaemonFileChange';
import { removeOwnFile } from './DaemonFileIdentity';
import type { IDaemonFileIdentity } from './DaemonFileIdentity';
import type { StopOperationGroupRecording } from './DaemonOperationGroupRecorder';
import type { IDaemonPaths } from './DaemonPaths';
import { releaseAfterAsync } from './DaemonReleaseAfter';

/** The files a listener created: its published POSIX socket and its lockfile. */
export interface IDaemonListenerFiles {
  readonly socket?: IDaemonFileIdentity;
  readonly lockfile?: IDaemonFileIdentity;
}

function keepNoRecords(): void {
  // Nothing was recorded before the lockfile was written.
}

export class DaemonListenerLifetime {
  readonly #files: IDaemonListenerFiles;
  readonly #paths: IDaemonPaths;
  readonly #server: net.Server;
  readonly #stopRecording: StopOperationGroupRecording;
  #closePromise: Promise<void> | undefined;
  #stopPromise: Promise<void> | undefined;
  // `removeOwnFile` releases the pinned identity, so each file is released once.
  #socketReleased: boolean = false;
  #lockfileReleased: boolean = false;

  public constructor(
    server: net.Server,
    paths: IDaemonPaths,
    files: IDaemonListenerFiles,
    stopRecording: StopOperationGroupRecording = keepNoRecords
  ) {
    this.#server = server;
    this.#paths = paths;
    this.#files = files;
    this.#stopRecording = stopRecording;
  }

  public stopAcceptingAsync(): Promise<void> {
    this.#stopPromise ??= this.#stopOnceAsync();
    return this.#stopPromise;
  }

  public closeAsync(): Promise<void> {
    this.#closePromise ??= releaseAfterAsync(this.stopAcceptingAsync(), () => this.#releaseLockfile());
    return this.#closePromise;
  }

  /**
   * Releases the socket and the lockfile for a process that exits without closing the listener, unless it has
   * children that a successor must reap first. Then both stay, as after a crash. Returns whether it released them.
   */
  public releaseForExit(): boolean {
    if (hasProcessesToReap(this.#paths)) return false;
    this.#releaseSocket();
    this.#releaseLockfile();
    return true;
  }

  /** Reports a published socket that no longer has its name, until this listener releases the socket. */
  public checkSocket(): DaemonFileChange | undefined {
    if (!this.#files.socket || this.#socketReleased) return undefined;
    return compareFileIdentity(this.#paths.socketPath, this.#files.socket);
  }

  async #stopOnceAsync(): Promise<void> {
    // Unlink first, as libuv does for the path it bound, but only this listener's own socket: the name may
    // belong to a successor by now. Close even when that fails, or the open server keeps the process up.
    try {
      this.#releaseSocket();
    } finally {
      await new Promise<void>((resolve: () => void) => this.#server.close(() => resolve()));
    }
  }

  #releaseSocket(): void {
    if (this.#socketReleased) return;
    this.#socketReleased = true;
    removeOwnFile(this.#paths.socketPath, this.#files.socket);
  }

  #releaseLockfile(): void {
    if (this.#lockfileReleased) return;
    this.#lockfileReleased = true;
    this.#stopRecording();
    removeOwnFile(this.#paths.lockfilePath, this.#files.lockfile);
  }
}
