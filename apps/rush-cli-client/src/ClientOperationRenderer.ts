// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { DaemonVerbosity, IDaemonEventEnvelope } from '@rushstack/rush-daemon-protocol';
import {
  DaemonRendererHost,
  type DaemonRenderStream,
  type IDaemonRendererTerminal
} from '@rushstack/rush-terminal-renderer';

interface IRenderedChunk {
  readonly text: string;
  readonly stream: DaemonRenderStream;
}

interface IClientOperationRendererOptions {
  readonly requestId: string;
  readonly terminal: Pick<IDaemonRendererTerminal, 'columns' | 'isTTY'>;
  readonly colorLevel: number;
  readonly verbosity: DaemonVerbosity;
  readonly writeAsync: (bytes: Uint8Array, stream: DaemonRenderStream) => Promise<void>;
}

/** Adapts the synchronous terminal renderer to the wire client's asynchronous output contract. */
export class ClientOperationRenderer {
  readonly #options: IClientOperationRendererOptions;
  readonly #host: DaemonRendererHost;
  #chunks: IRenderedChunk[] = [];

  public constructor(options: IClientOperationRendererOptions) {
    this.#options = options;
    this.#host = new DaemonRendererHost({
      colorLevel: options.colorLevel,
      verbosity: options.verbosity,
      terminal: {
        get columns() { return options.terminal.columns; },
        get isTTY() { return options.terminal.isTTY; },
        write: (text, stream) => { this.#chunks.push({ text, stream }); }
      }
    });
  }

  public initializeAsync(): Promise<void> {
    return this.#host.initializeAsync();
  }

  public async writeEventAsync(event: IDaemonEventEnvelope): Promise<void> {
    try {
      this.#host.handleEvent(event);
    } finally {
      await this.#flushAsync();
    }
  }

  public async writeLogAsync(
    bytes: Uint8Array,
    operationId: string,
    stream: DaemonRenderStream
  ): Promise<void> {
    if (operationId === this.#options.requestId) {
      // Global-command streams are raw bytes, not collated operation text.
      await this.#options.writeAsync(bytes, stream);
      return;
    }
    try {
      this.#host.handleLogChunk(operationId, stream, bytes);
    } finally {
      await this.#flushAsync();
    }
  }

  public async closeAsync(): Promise<void> {
    try {
      await this.#host.closeAsync();
    } finally {
      await this.#flushAsync();
    }
  }

  async #flushAsync(): Promise<void> {
    const chunks: IRenderedChunk[] = this.#chunks;
    this.#chunks = [];
    for (const chunk of chunks) {
      await this.#options.writeAsync(Buffer.from(chunk.text), chunk.stream);
    }
  }
}
