import ITask from './ITask';
import TaskStatus from './TaskStatus';
import TaskWriterFactory from './TaskWriterFactory';

export default class TaskRunner {
  private _tasks: Map<string, ITask>;

  constructor(tasks: Map<string, ITask>) {
    this._tasks = tasks;
  }

  execute(): Promise<Map<string, ITask>> {
    return undefined;
    // TaskWriterFactory.registerTask(task.name)
  }

  public getTasksByStatus(status: TaskStatus): Array<ITask> {
    const tasks = new Array<ITask>();
    this._tasks.forEach((task: ITask) => {
      if (task.status === status) {
        tasks.push(task);
      }
    });
    return tasks;
  }
}
