interface ITaskState {
  completed: boolean;
  stdout: string[];
}

export interface ITaskWriter {
  write(data: string): void;
  writeLine(data: string): void;
  getOutput(): string;
  close(): void;
}

export default class TaskWriterFactory {
  private static _tasks: Map<string, ITaskState> = new Map<string, ITaskState>();
  private static _activeTask: string = undefined;

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

    // console.log(`>>> Task [${taskName}] registered`);

    return {
      close: () => this._completeTask(taskName),
      getOutput: () => this._getTaskOutput(taskName),
      write: (data: string) => this._writeTaskOutput(taskName, data),
      writeLine: (data: string) => this._writeTaskOutput(taskName, data + '\n')
    };
  }

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

  private static _getTaskOutput(taskName: string): string {
    const taskState = this._tasks.get(taskName);
    if (!taskState) {
      throw new Error('The task is not registered!');
    }
    return taskState.stdout.join('');
  }

  private static _completeTask(taskName: string) {
    const taskState = this._tasks.get(taskName);
    if (!taskState || taskState.completed) {
      throw new Error('The task is not registered or has been completed and written.');
    }

    if (!this._activeTask) {
      process.stdout.write(taskState.stdout.join(''));
    } else if (taskName === this._activeTask) {
      this._activeTask = undefined;
      this._tasks.delete(taskName);
      this._writeAllCompletedTasks();
    } else {
      taskState.completed = true;
    }
  }

  private static _writeAllCompletedTasks() {
    this._tasks.forEach((task: ITaskState, taskName: string) => {
      if (task && task.completed) {
        process.stdout.write(task.stdout.join(''));
        this._tasks.delete(taskName);
      }
    });
  }
}
