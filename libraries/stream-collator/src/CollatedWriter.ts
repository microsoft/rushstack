// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ITerminalChunk } from './ITerminalChunk';
import { StreamCollator } from './StreamCollator';
import { CollatedTerminal } from './CollatedTerminal';
import { TerminalWritable } from './TerminalWritable';

/**
 * An writable interface for managing output of simultaneous processes.
 *
 * @beta
 */
export class CollatedWriter extends TerminalWritable {
  private readonly _collator: StreamCollator;
  private readonly _bufferedChunks: ITerminalChunk[];

  public readonly taskName: string;
  public readonly terminal: CollatedTerminal;

  public constructor(taskName: string, collator: StreamCollator) {
    super({ preventAutoclose: true });

    this.taskName = taskName;
    this.terminal = new CollatedTerminal(this);

    this._collator = collator;

    this._bufferedChunks = [];
  }

  public get isActive(): boolean {
    return this._collator.activeWriter === this;
  }

  public get bufferedChunks(): ReadonlyArray<ITerminalChunk> {
    return this._bufferedChunks;
  }

  public onWriteChunk(chunk: ITerminalChunk): void {
    this._collator._writerWriteChunk(this, chunk, this._bufferedChunks);
  }

  public onClose(): void {
    this._collator._writerClose(this, this._bufferedChunks);
  }

  /** @internal */
  public flushBufferedChunks(): void {
    for (const chunk of this._bufferedChunks) {
      this._collator.destination.writeChunk(chunk);
    }
    this._bufferedChunks.length = 0;
  }
}
