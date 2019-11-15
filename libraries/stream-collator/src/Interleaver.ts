// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';
import * as os from 'os';

/**
 * An writable interface for managing output of simultaneous processes.
 *
 * @public
 */
export interface ITaskWriter {
  write(data: string): void;      // Writes a string to the buffer
  writeLine(data: string): void;  // Writes a string with a newline character at the end
  writeError(data: string): void; // Writes an error to the stderr stream
  getStdOutput(): string;         // Returns standard output buffer as a string
  getStdError(): string;          // Returns standard error buffer as a string
  close(): void;                  // Closes the stream and marks the simultaneous process as completed
}

enum TaskWriterState {
  Open = 1,
  ClosedUnwritten = 2,
  Written = 3
}

interface ITaskWriterInfo {
  state: TaskWriterState;
  quietMode: boolean;
  stdout: string[];
  stderr: string[];
}

enum ITaskOutputStream {
  stdout = 1,
  stderr = 2
}

/**
 * A static class which manages the output of multiple threads.
 *
 * @public
 */
export class Interleaver {
  private static _tasks: Map<string, ITaskWriterInfo> = new Map<string, ITaskWriterInfo>();
  private static _activeTask: string = undefined;
  private static _stdout: { write: (text: string) => void } = process.stdout;

  private constructor() { }

  /**
   * Resets the default output stream
   */
  public static setStdOut(stdout: { write: (text: string) => void }): void {
    this._stdout = stdout;
  }

  /**
   * Registers a task into the list of active buffers and returns a ITaskWriter for the
   * calling process to use to manage output.
   */
  public static registerTask(taskName: string, quietMode: boolean = false): ITaskWriter {
    if (this._tasks.has(taskName)) {
      throw new Error('A task with that name has already been registered');
    }

    this._tasks.set(taskName, {
      quietMode: quietMode,
      state: TaskWriterState.Open,
      stderr: [],
      stdout: []
    });

    if (this._activeTask === undefined) {
      this._activeTask = taskName;
    }

    return {
      close: (): void => this._completeTask(taskName),
      getStdError: (): string => this._getTaskOutput(taskName, ITaskOutputStream.stderr),
      getStdOutput: (): string => this._getTaskOutput(taskName),
      write: (data: string): void => this._writeTaskOutput(taskName, data),
      writeError: (data: string): void => this._writeTaskOutput(taskName, data, ITaskOutputStream.stderr),
      writeLine: (data: string): void => this._writeTaskOutput(taskName, data + os.EOL)
    };
  }

  /**
   * Removes information about all running tasks
   */
  public static reset(): void {
    this._activeTask = undefined;
    this._tasks = new Map<string, ITaskWriterInfo>();
  }

  /**
   * Adds the text to the task's buffer, and writes it to the console if it is the active task
   */
  private static _writeTaskOutput(taskName: string, data: string,
    stream: ITaskOutputStream = ITaskOutputStream.stdout): void {

    const taskInfo: ITaskWriterInfo = this._tasks.get(taskName);
    if (!taskInfo || taskInfo.state !== TaskWriterState.Open) {
      throw new Error('The task is not registered or has been completed and written.');
    }
    const outputBuffer: string[] = (stream === ITaskOutputStream.stderr ? taskInfo.stderr : taskInfo.stdout);

    if (!this._activeTask) {
      this._activeTask = taskName;
      this._writeTask(taskName, taskInfo);
      taskInfo.state = TaskWriterState.Open;
    }

    outputBuffer.push(data);
    if (this._activeTask === taskName) {
      if (stream === ITaskOutputStream.stdout && !taskInfo.quietMode) {
        this._stdout.write(data);
      } else if (stream === ITaskOutputStream.stderr) {
        this._stdout.write(data);
      }
    }
  }

  /**
   * Returns the current value of the task's buffer
   */
  private static _getTaskOutput(taskName: string, stream: ITaskOutputStream = ITaskOutputStream.stdout): string {
    const taskInfo: ITaskWriterInfo = this._tasks.get(taskName);
    return (stream === ITaskOutputStream.stdout ? taskInfo.stdout : taskInfo.stderr).join('');
  }

  /**
   * Marks a task as completed. There are 3 cases:
   *  - If the task was the active task, also write out all completed, unwritten tasks
   *  - If there is no active task, write the output to the screen
   *  - If there is an active task, mark the task as completed and wait for active task to complete
   */
  private static _completeTask(taskName: string): void {
    const taskInfo: ITaskWriterInfo = this._tasks.get(taskName);
    if (!taskInfo || taskInfo.state !== TaskWriterState.Open) {
      throw new Error('The task is not registered or has been completed and written.');
    }

    if (this._activeTask === undefined) {
      this._writeTask(taskName, taskInfo);
    } else if (taskName === this._activeTask) {
      this._activeTask = undefined;
      taskInfo.state = TaskWriterState.Written;
      this._writeAllCompletedTasks();
    } else {
      taskInfo.state = TaskWriterState.ClosedUnwritten;
    }
  }

  /**
   * Helper function which writes all completed tasks
   */
  private static _writeAllCompletedTasks(): void {
    this._tasks.forEach((task: ITaskWriterInfo, taskName: string) => {
      if (task && task.state === TaskWriterState.ClosedUnwritten) {
        this._writeTask(taskName, task);
      }
    });
  }

  /**
   * Write and delete task
   */
  private static _writeTask(taskName: string, taskInfo: ITaskWriterInfo): void {
    taskInfo.state = TaskWriterState.Written;
    if (!taskInfo.quietMode) {
      this._stdout.write(taskInfo.stdout.join(''));
    }
    this._stdout.write(colors.red(taskInfo.stderr.join('')));
  }
}
