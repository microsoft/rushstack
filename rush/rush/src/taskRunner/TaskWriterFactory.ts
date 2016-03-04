/**
 * @file TaskWriterFactory.ts
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 *
 * A factory which creates streams designed for processes running in parallel to write their output to.
 * The streams 
 */

import * as colors from 'colors';

/**
 * An writable interface for managing output of simultaneous processes.
 * @todo #168347: should we export a WritableStream or Buffer or similar?
 */
export interface ITaskWriter {
  write(data: string): void;      // Writes a string to the buffer
  writeLine(data: string): void;  // Writes a string with a newline character at the end
  writeError(data: string): void; // Writes an error to the stderr stream
  getOutput(): string;            // Returns all output writted to the buffer
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

/**
 * A static class which manages the output of multiple threads.
 * @todo #168348: make this class not be static
 * @todo #168349: add ability to inject stdout WritableStream
 * @todo #168350: add unit testing
 */
export default class TaskWriterFactory {
  private static _tasks: Map<string, ITaskWriterInfo> = new Map<string, ITaskWriterInfo>();
  private static _activeTask: string = undefined;

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
      close: () => this._completeTask(taskName),
      getOutput: () => this._getTaskOutput(taskName),
      write: (data: string) => this._writeTaskOutput(taskName, data),
      writeError: (data: string) => this._writeTaskError(taskName, data),
      writeLine: (data: string) => this._writeTaskOutput(taskName, data + '\n')
    };
  }

  /**
   * Adds the text to the tasks's buffer, and writes it to the console if it is the active task
   */
  private static _writeTaskOutput(taskName: string, data: string) {
    const taskInfo = this._tasks.get(taskName);
    if (!taskInfo || taskInfo.state !== TaskWriterState.Open) {
      throw new Error('The task is not registered or has been completed and written.');
    }
    taskInfo.stdout.push(data);
    if (this._activeTask === taskName && !taskInfo.quietMode) {
      process.stdout.write(data);
    }
  }

  /**
   * Writes an error message to the standard buffer for the task
   */
  private static _writeTaskError(taskName: string, data: string) {
    const taskInfo = this._tasks.get(taskName);
    if (!taskInfo || taskInfo.state !== TaskWriterState.Open) {
      throw new Error('The task is not registered or has been completed and written.');
    }
    taskInfo.stderr.push(data);
    if (this._activeTask === taskName) {
      process.stdout.write(colors.red(data));
    }
  }

  /** 
   * Returns the current value of the task's buffer
   */
  private static _getTaskOutput(taskName: string): string {
    const taskInfo = this._tasks.get(taskName);
    if (!taskInfo) {
      throw new Error('The task is not registered!');
    }
    return taskInfo.stdout.join('');
  }

  /**
   * Marks a task as completed. There are 3 cases:
   *  - If the task was the active task, also write out all completed, unwritten tasks
   *  - If there is no active task, write the output to the screen
   *  - If there is an active task, mark the task as completed and wait for active task to complete
   */
  private static _completeTask(taskName: string) {
    const taskInfo = this._tasks.get(taskName);
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
  private static _writeAllCompletedTasks() {
    this._tasks.forEach((task: ITaskWriterInfo, taskName: string) => {
      if (task && task.state === TaskWriterState.ClosedUnwritten) {
        this._writeTask(taskName, task);
      }
    });
  }

  /**
   * Write and delete task
   */
  private static _writeTask(taskName: string, taskInfo: ITaskWriterInfo) {
    taskInfo.state = TaskWriterState.Written;
    if (!taskInfo.quietMode) {
      process.stdout.write(taskInfo.stdout.join(''));
    }
    process.stdout.write(colors.red(taskInfo.stderr.join('')));
  }
}
