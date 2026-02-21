// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { type ITerminalChunk, TerminalWritable } from '@rushstack/terminal';

import type { StreamCollator } from './StreamCollator.ts';
import { CollatedTerminal } from './CollatedTerminal.ts';

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

  /**
   * Returns true if this is the active writer for its associated {@link StreamCollator}.
   */
  public get isActive(): boolean {
    return this._collator.activeWriter === this;
  }

  /**
   * For diagnostic purposes, if the writer is buffering chunks because it has
   * not become active yet, they can be inspected via this property.
   */
  public get bufferedChunks(): ReadonlyArray<ITerminalChunk> {
    return this._bufferedChunks;
  }

  /** {@inheritDoc @rushstack/terminal#TerminalWritable.onWriteChunk} */
  public onWriteChunk(chunk: ITerminalChunk): void {
    this._collator._writerWriteChunk(this, chunk, this._bufferedChunks);
  }

  /** {@inheritDoc @rushstack/terminal#TerminalWritable.onClose} */
  public onClose(): void {
    this._collator._writerClose(this, this._bufferedChunks);
  }

  /** @internal */
  public _flushBufferedChunks(): void {
    for (const chunk of this._bufferedChunks) {
      this._collator.destination.writeChunk(chunk);
    }
    this._bufferedChunks.length = 0;
  }
}
