/**
 * @file ConsoleModerator.ts
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 *
 * A factory which creates streams designed for processes running in parallel to write their output to.
 */
/// <reference path="../typings/tsd.d.ts" />

enum ConsoleModeratorTaskState {
  Open = 1,
  ClosedUnwritten = 2,
  Written = 3
}

class IConsoleModeratorTask<T extends NodeJS.ReadableStream> {
  public stream: T;
  public state: ConsoleModeratorTaskState;
  public name: string;
  public buffer: string[];

  constructor(name: string, stream: T) {
    this.name = name;
    this.stream = stream;
    this.buffer = [];
    this.state = ConsoleModeratorTaskState.Open;
  }

  public flush(): string {
    const data: string = this.buffer.join('');
    this.buffer = [];
    return data;
  }
}

/**
 * A class which manages the output of multiple threads.
 */
export default class ConsoleModerator<T extends NodeJS.ReadableStream> {
  private _tasks: IConsoleModeratorTask<T>[] = [];
  private _activeTask: IConsoleModeratorTask<T> = undefined;

  private _stdout: NodeJS.WritableStream = process.stdout;

  /**
   * Resets the default output stream
   */
  public setStdOut(stdout: NodeJS.WritableStream): void {
    this._stdout = stdout;
  }

  /**
   * Registers a task into the list of active buffers and returns a IConsoleModerator for the
   * calling process to use to manage output.
   */
  public registerTask(taskName: string, stream: T): void {
    const task: IConsoleModeratorTask<T> = new IConsoleModeratorTask<T>(taskName, stream);

    stream.on('end', this._taskEnd(task));
    stream.on('data', this._taskData(task));

    this._tasks.push(task);
    this._ensureActiveTask();
  }

  /**
   * Locates a suitable task which could be set as the new active task
   */
  private _findActiveTaskCandidate(): IConsoleModeratorTask<T> {
    for (const task of this._tasks) {
      if (task.state === ConsoleModeratorTaskState.Open && task !== this._activeTask) {
        return task;
      }
    }
  }
  /**
   * Ensures that a task is set as active, will set the passed in task as the active task if none exists
   */
  private _ensureActiveTask(): void {
    if (!this._activeTask) {
      const task: IConsoleModeratorTask<T> = this._findActiveTaskCandidate();
      this._activeTask = task;

      // In some cases there may be no tasks which we can make active
      if (task) {
        this._writeTaskBuffer(task);
      }
    }
  }

  /**
   * Flushes a tasks buffer and writes it to disk
   */
  private _writeTaskBuffer(task: IConsoleModeratorTask<T>): void {
    if (task.buffer.length) {
      this._stdout.write(task.flush());
    }
  }

  /**
   * The on('data') callback handler, which either writes or buffers the data
   */
  private _taskData(task: IConsoleModeratorTask<T>): (data: string | Buffer) => void {
    return (data: string | Buffer) => {
      if (this._activeTask === task) {
        this._stdout.write(data.toString());
      } else {
        task.buffer.push(data.toString());
      }
    };
  }

  /**
   * Marks a task as completed. There are 3 cases:
   *  - If the task was the active task, also write out all completed, unwritten tasks
   *  - If there is no active task, write the output to the screen
   *  - If there is an active task, mark the task as completed and wait for active task to complete
   */
  private _taskEnd(task: IConsoleModeratorTask<T>): () => void {
    return () => {
      if (task === this._activeTask) {
        this._writeAllCompletedTasks();

        task.state = ConsoleModeratorTaskState.Written;

        this._activeTask = undefined;
        this._ensureActiveTask();
      } else {
        task.state = ConsoleModeratorTaskState.ClosedUnwritten;
      }
    };
  }

  /**
   * Helper function which writes all completed tasks
   */
  private _writeAllCompletedTasks(): void {
    for (const task of this._tasks) {
      if (task && task.state === ConsoleModeratorTaskState.ClosedUnwritten) {
        this._writeTaskBuffer(task);
        task.state = ConsoleModeratorTaskState.Written;
      }
    }
  }
}
