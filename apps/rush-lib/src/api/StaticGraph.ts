import { Interleaver } from '@microsoft/stream-collator';

import { TaskSelector } from '../logic/TaskSelector';
import { RushConfiguration } from './RushConfiguration';
import { RushConfigurationProject } from './RushConfigurationProject';
import { ITask } from '../logic/taskRunner/ITask';

export interface IStaticProject {
  rushProject: RushConfigurationProject;
  buildCommand: string;
  dependencies: RushConfigurationProject[];
}

export class StaticGraph {
  private _rushConfiguration: RushConfiguration;
  private _taskSelector: TaskSelector;

  constructor(rushConfiguration: RushConfiguration) {
    this._rushConfiguration = rushConfiguration;
    this._taskSelector = new TaskSelector({
      rushConfiguration: rushConfiguration,
      commandToRun: 'build',
      toFlags: [],
      fromFlags: [],
      customParameterValues: [],
      ignoreMissingScript: false,
      ignoreDependencyOrder: false,
      isIncrementalBuildAllowed: true,
      isQuietMode: true,
      staticMode: true
    });
  }

  public async generate(): Promise<IStaticProject[]> {
    const tasks: Promise<IStaticProject>[] =
      this._taskSelector
          .registerTasks()
          .getOrderedTasks()
          .map((task) => this._getStaticProject(task, this._rushConfiguration));

    return await Promise.all(tasks);
  }

  private async _getStaticProject(task: ITask, rushConfig: RushConfiguration): Promise<IStaticProject> {

    task.writer = Interleaver.registerTask(task.name, true);
    await task.execute(task.writer);

    const deps: RushConfigurationProject[] = [];
    task.dependencies.forEach((t) => deps.push(rushConfig.getProjectByName(t.name)!));

    return {
      rushProject: rushConfig.getProjectByName(task.name)!,
      buildCommand: task.writer.getStdOutput(),
      dependencies: deps
    };
  }
}
