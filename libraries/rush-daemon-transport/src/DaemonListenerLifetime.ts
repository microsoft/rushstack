// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as net from 'node:net';

import { removeDaemonArtifacts } from './DaemonLockfile';
import type { IDaemonPaths } from './DaemonPaths';

export class DaemonListenerLifetime {
  readonly #paths: IDaemonPaths;
  readonly #server: net.Server;
  #closePromise: Promise<void> | undefined;
  #stopPromise: Promise<void> | undefined;

  public constructor(server: net.Server, paths: IDaemonPaths) {
    this.#server = server;
    this.#paths = paths;
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
    removeDaemonArtifacts(this.#paths.lockfilePath, this.#paths.socketPath);
  }
}
