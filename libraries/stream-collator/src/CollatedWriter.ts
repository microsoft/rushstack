// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * @public
 */
export enum CollatedWriterState {
  Open = 1,
  ClosedUnwritten = 2,
  Written = 3
}

/**
 * @public
 */
export interface IStdioMessage {
  stream: 'stdout' | 'stderr';
  text: string;
}

/**
 * An writable interface for managing output of simultaneous processes.
 *
 * @public
 */
export class CollatedWriter<TMessage = IStdioMessage> {
  public readonly taskName: string;

  /**
   * @internal
   */
  public readonly _collator: StreamCollator<TMessage>;

  private _state: CollatedWriterState;

  private readonly _accumulatedMessages: TMessage[];

  public constructor(taskName: string, collator: StreamCollator<TMessage>) {
    this.taskName = taskName;
    this._collator = collator;

    this._state = CollatedWriterState.Open;
    this._accumulatedMessages = [];
  }

  public get state(): CollatedWriterState {
    return this._state;
  }

  public get accumulatedMessages(): ReadonlyArray<TMessage> {
    return this._accumulatedMessages;
  }

  /**
   * Adds the text to the task's buffer, and writes it to the console if it is the active task
   */
  public writeMessage(message: TMessage): void {
    if (this.state !== CollatedWriterState.Open) {
      throw new Error('The task is not registered or has been completed and written.');
    }

    if (this._collator.activeWriter === undefined) {
      this._collator._setActiveWriter(this);
      this._flushUnwrittenOutput();
      this._state = CollatedWriterState.Open;
    }

    if (this._collator.activeWriter === this) {
      this._collator.writeToStream(message);
    } else {
      this._accumulatedMessages.push(message);
    }
  }

  /**
   * Marks a task as completed. There are 3 cases:
   *  - If the task was the active task, also write out all completed, unwritten tasks
   *  - If there is no active task, write the output to the screen
   *  - If there is an active task, mark the task as completed and wait for active task to complete
   */
  public close(): void {
    if (this.state !== CollatedWriterState.Open) {
      throw new Error('The task is not registered or has been completed and written.');
    }

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
    for (const message of this._accumulatedMessages) {
      this._collator.writeToStream(message);
    }

    // Free the memory as soon as we have written the output, to avoid a resource leak
    this._accumulatedMessages.length = 0;
  }
}

import { StreamCollator } from './StreamCollator';
