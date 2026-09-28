// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as net from 'node:net';

import { removeDaemonArtifacts } from './DaemonLockfile';
import type { StopOperationGroupRecording } from './DaemonOperationGroupRecorder';
import type { IDaemonPaths } from './DaemonPaths';

function keepNoRecords(): void {
  // Nothing was recorded before the lockfile was written.
}

export class DaemonListenerLifetime {
  readonly #paths: IDaemonPaths;
  readonly #server: net.Server;
  readonly #stopRecording: StopOperationGroupRecording;
  #closePromise: Promise<void> | undefined;
  #stopPromise: Promise<void> | undefined;

  public constructor(
    server: net.Server,
    paths: IDaemonPaths,
    stopRecording: StopOperationGroupRecording = keepNoRecords
  ) {
    this.#server = server;
    this.#paths = paths;
    this.#stopRecording = stopRecording;
  }

  public stopAcceptingAsync(): Promise<void> {
    this.#stopPromise ??= new Promise<void>((resolve) => this.#server.close(() => resolve()));
    return this.#stopPromise;
  }

  public closeAsync(): Promise<void> {
    this.#closePromise ??= this.#closeOnceAsync();
    return this.#closePromise;
  }

  async #closeOnceAsync(): Promise<void> {
    await this.stopAcceptingAsync();
    this.#stopRecording();
    removeDaemonArtifacts(this.#paths.lockfilePath, this.#paths.socketPath);
  }
}
