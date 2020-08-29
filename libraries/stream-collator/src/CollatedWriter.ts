// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';
import * as os from 'os';

enum TaskOutputStream {
  stdout = 1,
  stderr = 2
}

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
  public readonly taskName: string;

  /**
   * @internal
   */
  public readonly _collator: StreamCollator;

  public readonly quietMode: boolean;

  private _state: CollatedWriterState;

  private readonly _stdout: string[];
  private readonly _stderr: string[];

  public constructor(taskName: string, collator: StreamCollator, quietMode: boolean) {
    this.taskName = taskName;
    this._collator = collator;
    this.quietMode = quietMode;

    this._state = CollatedWriterState.Open;
    this._stdout = [];
    this._stderr = [];
  }

  public get state(): CollatedWriterState {
    return this._state;
  }

  // Writes a string to the buffer
  public write(data: string): void {
    this._writeTaskOutput(data, TaskOutputStream.stdout);
  }
  // Writes a string with a newline character at the end
  public writeLine(data: string): void {
    this._writeTaskOutput(data + os.EOL, TaskOutputStream.stdout);
  }
  // Writes an error to the stderr stream
  public writeError(data: string): void {
    this._writeTaskOutput(data, TaskOutputStream.stderr);
  }

  // Returns standard output buffer as a string
  public getStdOutput(): string {
    return this._stdout.join('');
  }

  // Returns standard error buffer as a string
  public getStdError(): string {
    return this._stderr.join('');
  }

  /**
   * Adds the text to the task's buffer, and writes it to the console if it is the active task
   */
  private _writeTaskOutput(data: string, stream: TaskOutputStream): void {
    if (this.state !== CollatedWriterState.Open) {
      throw new Error('The task is not registered or has been completed and written.');
    }
    const outputBuffer: string[] = stream === TaskOutputStream.stderr ? this._stderr : this._stdout;

    if (this._collator.activeWriter === undefined) {
      this._collator._setActiveWriter(this);
      this._writeTask();
      this._state = CollatedWriterState.Open;
    }

    outputBuffer.push(data);

    if (this._collator.activeWriter === this) {
      if (stream === TaskOutputStream.stdout && !this.quietMode) {
        this._collator._stdout.write(data);
      } else if (stream === TaskOutputStream.stderr) {
        this._collator._stdout.write(data);
      }
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
      this._writeTask();
    } else if (this._collator.activeWriter === this) {
      this._collator._setActiveWriter(undefined);
      this._state = CollatedWriterState.Written;
      this._writeAllCompletedTasks();
    } else {
      this._state = CollatedWriterState.ClosedUnwritten;
    }
  }

  /**
   * Helper function which writes all completed tasks
   */
  private _writeAllCompletedTasks(): void {
    for (const writer of this._collator.writers) {
      if (writer.state === CollatedWriterState.ClosedUnwritten) {
        writer._writeTask();
      }
    }
  }

  private _writeTask(): void {
    this._state = CollatedWriterState.Written;
    if (!this.quietMode) {
      this._collator._stdout.write(this._stdout.join(''));
    }
    this._collator._stdout.write(colors.red(this._stderr.join('')));
  }
}

import { StreamCollator } from './StreamCollator';
