import * as colors from 'colors';
import ITask, { ITaskDefinition } from './ITask';
import TaskStatus from './TaskStatus';
import TaskWriterFactory, { ITaskWriter } from './TaskWriterFactory';

export default class TaskRunner {
  private _tasks: Map<string, ITask>;
  private _readyTaskQueue: Array<ITask>;

  constructor() {
    this._tasks = new Map<string, ITask>();
    this._readyTaskQueue = new Array<ITask>();
  }

  public addTask(taskDefinition: ITaskDefinition) {
    const task = taskDefinition as ITask;
    task.dependencies = new Array<ITask>();
    task.dependents = new Array<ITask>();
    task.status = TaskStatus.NotStarted;
    this._tasks.set(task.name, task);
  }

  public addDependencies(taskName: string, taskDependencies?: Array<string>) {
    const task = this._tasks.get(taskName);
    if (taskDependencies !== undefined) {
      taskDependencies.forEach((dependencyName: string) => {
        const dependency = this._tasks.get(dependencyName);
        task.dependencies.push(dependency);
        dependency.dependents.push(task);
      });
    }
  }

  public execute(): Promise<void> {
    return new Promise<void>((complete: () => void, reject: () => void) => {
      this._startAvailableTasks(complete);
    });
  }

  private _startAvailableTasks(complete: () => void) {
    this._addReadyTasksToQueue();

    if (this._areAllTasksCompleted()) {
      console.log(colors.green('> TaskRunner :: All tasks completed!\n'));
      complete();
    }

    while (this._readyTaskQueue.length) {
      const task: ITask = this._readyTaskQueue.shift();

      console.log(colors.yellow(`> TaskRunner :: Starting task [${task.name}]`));
      task.status = TaskStatus.Executing;

      let taskWriter = TaskWriterFactory.registerTask(task.name);

      let onTaskComplete = (completedTask: ITask, writer: ITaskWriter) => {
        writer.close();
        this._markTaskAsCompleted(completedTask);
        this._startAvailableTasks(complete);
      };

      task.execute(taskWriter).then(onTaskComplete.bind(this, task, taskWriter));
    }
  }

  private _markTaskAsCompleted(task: ITask) {
    console.log(colors.green(`> TaskRunner :: Completed task [${task.name}]\n`));
    task.status = TaskStatus.Completed;
    task.dependents.forEach((dependent: ITask) => {
      const i = dependent.dependencies.indexOf(task);
      if (i !== -1) {
        dependent.dependencies.splice(i);
      }
    });
  }
  private _areAllTasksCompleted(): boolean {
    let anyNonCompletedTasks = true;
    this._tasks.forEach((task: ITask) => {
      if (task.status !== TaskStatus.Completed) {
        anyNonCompletedTasks = false;
      }
    });
    return anyNonCompletedTasks;
  }

  private _addReadyTasksToQueue() {
    this._tasks.forEach((task: ITask) => {
      if (task.dependencies.length === 0 && task.status === TaskStatus.NotStarted) {
        this._readyTaskQueue.push(task);
      }
    });
  }
}
