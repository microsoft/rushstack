/**
 * @file TaskWriterFactory.ts
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 *
 * A factory which creates streams designed for processes running in parallel to write their output to.
 * The streams 
 */

/**
 * An writable interface for managing output of simultaneous processes.
 * @todo - should we export a WritableStream or similar?
 */
export interface ITaskWriter {
  write(data: string): void;     // Writes a string to the buffer
  writeLine(data: string): void; // Writes a string with a newline character at the end
  getOutput(): string;           // Returns all output writted to the buffer
  close(): void;                 // Closes the stream and marks the simultaneous process as completed
}

interface ITaskState {
  completed: boolean;
  stdout: string[];
}

/**
 * A static class which manages the output of multiple threads.
 * @todo - make this class not be static
 * @todo - add ability to inject stdout WritableStream
 */
export default class TaskWriterFactory {
  private static _tasks: Map<string, ITaskState> = new Map<string, ITaskState>();
  private static _activeTask: string = undefined;

  /**
   * Registers a task into the list of active buffers and returns a ITaskWriter for the
   * calling process to use to manage output.
   */
  public static registerTask(taskName: string): ITaskWriter {
    if (this._tasks.has(taskName)) {
      throw new Error('A task with that name has already been registered');
    }

    this._tasks.set(taskName, {
      completed: false,
      stdout: []
    });

    if (!this._activeTask) {
      this._activeTask = taskName;
    }

    return {
      close: () => this._completeTask(taskName),
      getOutput: () => this._getTaskOutput(taskName),
      write: (data: string) => this._writeTaskOutput(taskName, data),
      writeLine: (data: string) => this._writeTaskOutput(taskName, data + '\n')
    };
  }

  /**
   * Adds the text to the tasks's buffer, and writes it to the console if it is the active task
   */
  private static _writeTaskOutput(taskName: string, data: string) {
    const taskState = this._tasks.get(taskName);
    if (!taskState || taskState.completed) {
      throw new Error('The task is not registered or has been completed and written.');
    }
    taskState.stdout.push(data);
    if (this._activeTask === taskName) {
      process.stdout.write(data);
    }
  }

  /** 
   * Returns the current value of the task's buffer
   */
  private static _getTaskOutput(taskName: string): string {
    const taskState = this._tasks.get(taskName);
    if (!taskState) {
      throw new Error('The task is not registered!');
    }
    return taskState.stdout.join('');
  }

  /**
   * Marks a task as completed. There are 3 cases:
   *  - If the task was the active task, also write out all completed, unwritten tasks
   *  - If there is no active task, write the output to the screen
   *  - If there is an active task, mark the task as completed and wait for active task to complete
   */
  private static _completeTask(taskName: string) {
    const taskState = this._tasks.get(taskName);
    if (!taskState || taskState.completed) {
      throw new Error('The task is not registered or has been completed and written.');
    }

    if (!this._activeTask) {
      process.stdout.write(taskState.stdout.join(''));
      this._tasks.delete(taskName);
    } else if (taskName === this._activeTask) {
      this._activeTask = undefined;
      this._tasks.delete(taskName);
      this._writeAllCompletedTasks();
    } else {
      taskState.completed = true;
    }
  }

  /**
   * Helper function which writes all completed tasks
   */
  private static _writeAllCompletedTasks() {
    this._tasks.forEach((task: ITaskState, taskName: string) => {
      if (task && task.completed) {
        process.stdout.write(task.stdout.join(''));
        this._tasks.delete(taskName);
      }
    });
  }
}
