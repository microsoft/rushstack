// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ITerminalChunk, TerminalChunkKind } from '@rushstack/terminal';

type Utf8Decoder = InstanceType<typeof TextDecoder>;
type StreamDecoders = Map<TerminalChunkKind, Utf8Decoder>;

const UTF8: string = 'utf8';

/** Keeps fragmented text independent across operation IDs and output streams. */
export class OperationTextDecoder {
  readonly #operations: Map<string, StreamDecoders> = new Map();

  public decode(operationId: string, kind: TerminalChunkKind, bytes: Uint8Array): ITerminalChunk {
    return { kind, text: this.#getDecoder(operationId, kind).decode(bytes, { stream: true }) };
  }

  public flush(operationId: string, write: (chunk: ITerminalChunk) => void): void {
    for (const [kind, decoder] of this.#takeDecoders(operationId)) {
      const text: string = decoder.decode();
      if (text) write({ kind, text });
    }
  }

  #getDecoder(operationId: string, kind: TerminalChunkKind): Utf8Decoder {
    let streams: StreamDecoders | undefined = this.#operations.get(operationId);
    if (!streams) {
      streams = new Map();
      this.#operations.set(operationId, streams);
    }
    let decoder: Utf8Decoder | undefined = streams.get(kind);
    if (!decoder) {
      decoder = new TextDecoder(UTF8);
      streams.set(kind, decoder);
    }
    return decoder;
  }

  #takeDecoders(operationId: string): StreamDecoders {
    const streams: StreamDecoders = this.#operations.get(operationId) ?? new Map();
    this.#operations.delete(operationId);
    return streams;
  }
}
