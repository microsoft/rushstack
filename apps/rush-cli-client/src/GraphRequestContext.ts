// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { DaemonClient, type IDaemonClientConnectOptions } from '@rushstack/rush-client-core';
import type { IDaemonRequestAdmissionOptions } from '@rushstack/rush-daemon-protocol';

export class GraphRequestCancelledError extends Error {
  public constructor() {
    super('Graph request cancelled.');
  }
}

/** Owns cancellation and one admission deadline across generation lookup and mutation. */
export class GraphRequestContext implements Disposable {
  readonly #abort: AbortController = new AbortController();
  readonly #admission: IDaemonRequestAdmissionOptions;
  readonly #deadline: number | undefined;

  public constructor(admission: IDaemonRequestAdmissionOptions) {
    this.#admission = Object.freeze({ ...admission });
    // Zero means immediate server admission, not a timeout on connecting to the server.
    this.#deadline = admission.waitTimeoutMs ? Date.now() + admission.waitTimeoutMs : undefined;
    process.on('SIGINT', this.#onSignal);
    process.on('SIGTERM', this.#onSignal);
  }

  public get signal(): AbortSignal {
    return this.#abort.signal;
  }

  public get admission(): IDaemonRequestAdmissionOptions {
    const remaining: number | undefined = this.#remainingTimeoutMs();
    return remaining === undefined ? this.#admission : { ...this.#admission, waitTimeoutMs: remaining };
  }

  public async connectAsync(options: IDaemonClientConnectOptions): Promise<DaemonClient> {
    const remaining: number | undefined = this.admission.waitTimeoutMs;
    let client: DaemonClient;
    try {
      client = await DaemonClient.connectAsync({
        ...options,
        timeoutMs: remaining ? Math.min(remaining, options.timeoutMs ?? 5000) : options.timeoutMs
      });
    } catch (error) {
      this.signal.throwIfAborted();
      throw error;
    }
    try {
      this.#remainingTimeoutMs();
      return client;
    } catch (error) {
      await client.closeAsync();
      throw error;
    }
  }

  public [Symbol.dispose](): void {
    process.removeListener('SIGINT', this.#onSignal);
    process.removeListener('SIGTERM', this.#onSignal);
  }

  #remainingTimeoutMs(): number | undefined {
    this.signal.throwIfAborted();
    if (this.#deadline === undefined) return undefined;
    const remaining: number = this.#deadline - Date.now();
    if (remaining <= 0) {
      throw new Error('Graph admission deadline expired; no further graph request was sent.');
    }
    return remaining;
  }

  readonly #onSignal = (): void => this.#abort.abort(new GraphRequestCancelledError());
}
