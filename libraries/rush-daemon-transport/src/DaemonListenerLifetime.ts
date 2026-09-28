// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as net from 'node:net';

import { removeOwnFile } from './DaemonFileIdentity';
import type { IDaemonFileIdentity } from './DaemonFileIdentity';
import type { StopOperationGroupRecording } from './DaemonOperationGroupRecorder';
import type { IDaemonPaths } from './DaemonPaths';

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
    this.#closePromise ??= this.#closeOnceAsync();
    return this.#closePromise;
  }

  #stopOnceAsync(): Promise<void> {
    // Unlink before closing, as libuv does for the path it bound, but only this listener's own socket: the
    // name may belong to a successor by now.
    removeOwnFile(this.#paths.socketPath, this.#files.socket);
    return new Promise<void>((resolve: () => void) => this.#server.close(() => resolve()));
  }

  async #closeOnceAsync(): Promise<void> {
    await this.stopAcceptingAsync();
    this.#stopRecording();
    removeOwnFile(this.#paths.lockfilePath, this.#files.lockfile);
  }
}
