/// <reference path="../typings/tsd.d.ts" />

interface ITaskState {
  completed: boolean;
  stdout: string[];
}

export interface ITaskWriter {
  write: (data: string) => void;
  writeLine: (data: string) => void;
}

export default class TaskOutputManager {
  private _tasks: { [taskName: string]: ITaskState } = {};
  private _activeTask: string = undefined;

  public registerTask(taskName: string): ITaskWriter {
    if (taskName in this._tasks) {
      throw new Error('A task with that name has already been registered');
    }

    this._tasks[taskName] = {
      completed: false,
      stdout: []
    };

    if (!this._activeTask) {
      this._activeTask = taskName;
    }

    console.log(`>>> Task [${taskName}] registered`);

    const write = (data: string) => {
      this.writeTaskOutput(taskName, data);
    };
    return {
      write: write,
      writeLine: (data: string) => write(data + '\n')
    };
  }

  public writeTaskOutput(taskName: string, data: string) {
    const taskState = this._tasks[taskName];
    if (!taskState || taskState.completed) {
      throw new Error('The task is not registered or has been completed and written.');
    }
    taskState.stdout.push(data);
    if (this._activeTask === taskName) {
      process.stdout.write(data);
    }
  }

  public getTaskOutput(taskName: string): string {
    const taskState = this._tasks[taskName];
    if (!taskState) {
      throw new Error('The task is not registered!');
    }
    return taskState.stdout.join('');
  }

  public completeTask(taskName: string) {
    const taskState = this._tasks[taskName];
    if (!taskState || taskState.completed) {
      throw new Error('The task is not registered or has been completed and written.');
    }

    if (!this._activeTask) {
      process.stdout.write(taskState.stdout.join(''));
    } else if (taskName === this._activeTask) {
      this._tasks[taskName] = this._activeTask = undefined;
      this._writeAllCompletedTasks();
    } else {
      taskState.completed = true;
    }
  }

  private _writeAllCompletedTasks() {
    /* tslint:disable */
    for (let otherTaskName in this._tasks) {
    /* tslint:enable */
      const otherTaskState = this._tasks[otherTaskName];
      if (otherTaskState && otherTaskState.completed) {
        process.stdout.write(otherTaskState.stdout.join(''));
        this._tasks[otherTaskName] = undefined;
      }
    }
  }
}
