// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { type ITerminalChunk, TerminalWritable } from '@rushstack/terminal';

import type { StreamCollator } from './StreamCollator';
import { CollatedTerminal } from './CollatedTerminal';

/**
 * An writable interface for managing output of simultaneous processes.
 *
 * @beta
 */
export class CollatedWriter extends TerminalWritable {
  readonly #collator: StreamCollator;
  readonly #bufferedChunks: ITerminalChunk[];

  public readonly taskName: string;
  public readonly terminal: CollatedTerminal;

  public constructor(taskName: string, collator: StreamCollator) {
    super({ preventAutoclose: true });

    this.taskName = taskName;
    this.terminal = new CollatedTerminal(this);

    this.#collator = collator;

    this.#bufferedChunks = [];
  }

  /**
   * Returns true if this is the active writer for its associated {@link StreamCollator}.
   */
  public get isActive(): boolean {
    return this.#collator.activeWriter === this;
  }

  /**
   * For diagnostic purposes, if the writer is buffering chunks because it has
   * not become active yet, they can be inspected via this property.
   */
  public get bufferedChunks(): ReadonlyArray<ITerminalChunk> {
    return this.#bufferedChunks;
  }

  /** {@inheritDoc @rushstack/terminal#TerminalWritable.onWriteChunk} */
  public onWriteChunk(chunk: ITerminalChunk): void {
    this.#collator._writerWriteChunk(this, chunk, this.#bufferedChunks);
  }

  /** {@inheritDoc @rushstack/terminal#TerminalWritable.onClose} */
  public override onClose(): void {
    this.#collator._writerClose(this, this.#bufferedChunks);
  }

  /** @internal */
  public _flushBufferedChunks(): void {
    for (const chunk of this.#bufferedChunks) {
      this.#collator.destination.writeChunk(chunk);
    }
    this.#bufferedChunks.length = 0;
  }
}
