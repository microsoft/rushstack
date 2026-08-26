// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ITerminalChunk } from '@rushstack/terminal';

export class OperationOutputBuffer {
  private readonly _chunksByOperation: Map<string, ITerminalChunk[]> = new Map();

  public add(operationId: string, chunk: ITerminalChunk): void {
    let chunks: ITerminalChunk[] | undefined = this._chunksByOperation.get(operationId);
    if (chunks === undefined) {
      chunks = [];
      this._chunksByOperation.set(operationId, chunks);
    }
    chunks.push(chunk);
  }

  public take(operationId: string): ReadonlyArray<ITerminalChunk> {
    const chunks: ReadonlyArray<ITerminalChunk> = this._chunksByOperation.get(operationId) ?? [];
    this._chunksByOperation.delete(operationId);
    return chunks;
  }
}
