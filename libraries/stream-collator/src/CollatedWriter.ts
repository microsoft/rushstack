// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ITerminalChunk } from './ITerminalChunk';
import { CollatedTerminal } from './CollatedTerminal';
import { TerminalWritable } from './TerminalWritable';

/**
 * @beta
 */
export enum CollatedWriterState {
  Open = 1,
  ClosedUnwritten = 2,
  Written = 3
}

/**
 * An writable interface for managing output of simultaneous processes.
 *
 * @beta
 */
export class CollatedWriter extends TerminalWritable {
  public readonly taskName: string;

  public readonly terminal: CollatedTerminal;

  /**
   * @internal
   */
  public readonly _collator: StreamCollator;

  private _state: CollatedWriterState;

  private readonly _accumulatedChunks: ITerminalChunk[];

  public constructor(taskName: string, collator: StreamCollator) {
    super({ preventAutoclose: true });

    this.taskName = taskName;
    this.terminal = new CollatedTerminal(this);

    this._collator = collator;

    this._state = CollatedWriterState.Open;
    this._accumulatedChunks = [];
  }

  public get state(): CollatedWriterState {
    return this._state;
  }

  public get accumulatedChunks(): ReadonlyArray<ITerminalChunk> {
    return this._accumulatedChunks;
  }

  /**
   * Adds the text to the task's buffer, and writes it to the console if it is the active task
   */
  public onWriteChunk(chunk: ITerminalChunk): void {
    if (this._collator.activeWriter === undefined) {
      this._collator._setActiveWriter(this);
      this._flushUnwrittenOutput();
      this._state = CollatedWriterState.Open;
    }

    if (this._collator.activeWriter === this) {
      this._collator.terminal.writeChunk(chunk);
    } else {
      this._accumulatedChunks.push(chunk);
    }
  }

  /**
   * Marks a task as completed. There are 3 cases:
   *  - If the task was the active task, also write out all completed, unwritten tasks
   *  - If there is no active task, write the output to the screen
   *  - If there is an active task, mark the task as completed and wait for active task to complete
   */
  public onClose(): void {
    if (this._collator.activeWriter === undefined) {
      this._flushUnwrittenOutput();
    } else if (this._collator.activeWriter === this) {
      this._collator._setActiveWriter(undefined);
      this._state = CollatedWriterState.Written;
      this._flushAllCompletedTasks();
    } else {
      this._state = CollatedWriterState.ClosedUnwritten;
    }
  }

  /**
   * Helper function which writes all completed tasks
   */
  private _flushAllCompletedTasks(): void {
    // TODO: Use a different data structure to avoid O(n)
    for (const writer of this._collator.writers) {
      if (writer.state === CollatedWriterState.ClosedUnwritten) {
        writer._flushUnwrittenOutput();
      }
    }
  }

  private _flushUnwrittenOutput(): void {
    this._state = CollatedWriterState.Written;
    for (const chunk of this._accumulatedChunks) {
      this._collator.terminal.writeChunk(chunk);
    }

    // Free the memory as soon as we have written the output, to avoid a resource leak
    this._accumulatedChunks.length = 0;
  }
}

import { StreamCollator } from './StreamCollator';
