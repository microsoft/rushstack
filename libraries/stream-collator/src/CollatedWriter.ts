// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Text } from '@rushstack/node-core-library';
import { ICollatedChunk, StreamKind } from './CollatedChunk';

/**
 * @public
 */
export enum CollatedWriterState {
  Open = 1,
  ClosedUnwritten = 2,
  Written = 3
}

/**
 * An writable interface for managing output of simultaneous processes.
 *
 * @public
 */
export class CollatedWriter {
  // Capture up to this many leading lines
  private static _LEADING_LINES: number = 10;

  // Capture up to this many trailing lines
  private static _TRAILING_LINES: number = 10;

  public readonly taskName: string;

  /**
   * @internal
   */
  public readonly _collator: StreamCollator;

  private _state: CollatedWriterState;

  private readonly _accumulatedChunks: ICollatedChunk[];

  private _accumulatedLine: string;
  private _accumulatedStderr: boolean;

  private readonly _abridgedLeading: string[];
  private readonly _abridgedTrailing: string[];
  private _abridgedOmittedLines: number = 0;
  private _abridgedStderr: boolean;

  public constructor(taskName: string, collator: StreamCollator) {
    this.taskName = taskName;
    this._collator = collator;

    this._state = CollatedWriterState.Open;
    this._accumulatedChunks = [];

    this._accumulatedLine = '';
    this._accumulatedStderr = false;

    this._abridgedLeading = [];
    this._abridgedTrailing = [];
    this._abridgedStderr = false;
  }

  public get state(): CollatedWriterState {
    return this._state;
  }

  public get accumulatedChunks(): ReadonlyArray<ICollatedChunk> {
    return this._accumulatedChunks;
  }

  /**
   * Adds the text to the task's buffer, and writes it to the console if it is the active task
   */
  public writeChunk(chunk: ICollatedChunk): void {
    if (this.state !== CollatedWriterState.Open) {
      throw new Error('The task is not registered or has been completed and written.');
    }

    if (this._collator.activeWriter === undefined) {
      this._collator._setActiveWriter(this);
      this._flushUnwrittenOutput();
      this._state = CollatedWriterState.Open;
    }

    this._processChunk(chunk);

    if (this._collator.activeWriter === this) {
      this._collator.writeToStream(chunk);
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

    // Is there a partial accumulated line?
    if (this._accumulatedLine.length > 0) {
      // close it off
      this._processAccumulatedLine(this._accumulatedLine, this._accumulatedStderr);
      this._accumulatedLine = '';
      this._accumulatedStderr = false;
    }
  }

  public getSummaryReport(): string[] {
    if (this.state === CollatedWriterState.Open) {
      throw new Error('The summary cannot be prepared until after close() is called.');
    }
    const report: string[] = [...this._abridgedLeading];
    if (this._abridgedOmittedLines > 0) {
      report.push(`(${this._abridgedOmittedLines} lines omitted)`);
    }
    report.push(...this._abridgedTrailing);
    return report;
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
      this._collator.writeToStream(chunk);
    }

    // Free the memory as soon as we have written the output, to avoid a resource leak
    this._accumulatedChunks.length = 0;
  }

  private _processChunk(chunk: ICollatedChunk): void {
    const text: string = Text.convertToLf(chunk.text);
    let startIndex: number = 0;

    while (startIndex < text.length) {
      if (chunk.stream === StreamKind.Stderr) {
        this._accumulatedStderr = true;
      }

      const endIndex: number = text.indexOf('\n', startIndex);
      if (endIndex < 0) {
        // we did not find \n, so simply append
        this._accumulatedLine += text.substring(startIndex);
        break;
      }

      // append everything up to \n
      this._accumulatedLine += text.substring(startIndex, endIndex);

      // process the line
      this._processAccumulatedLine(this._accumulatedLine, this._accumulatedStderr);
      this._accumulatedLine = '';
      this._accumulatedStderr = false;

      // skip the \n
      startIndex = endIndex + 1;
    }
  }

  private _processAccumulatedLine(line: string, includesStderr: boolean): void {
    if (includesStderr && !this._abridgedStderr) {
      // The first time we see stderr, switch to capturing stderr
      this._abridgedStderr = true;
      this._abridgedLeading.length = 0;
      this._abridgedTrailing.length = 0;
      this._abridgedOmittedLines = 0;
    } else if (this._abridgedStderr && !includesStderr) {
      // If we're capturing stderr, then ignore non-stderr input
      return;
    }

    // Did we capture enough leading lines?
    if (this._abridgedLeading.length < CollatedWriter._LEADING_LINES) {
      this._abridgedLeading.push(line);
      return;
    }

    this._abridgedTrailing.push(line);

    // If we captured to many trailing lines, omit the extras
    while (this._abridgedTrailing.length > CollatedWriter._TRAILING_LINES) {
      this._abridgedTrailing.shift();
      ++this._abridgedOmittedLines;
    }
  }
}

import { StreamCollator } from './StreamCollator';
