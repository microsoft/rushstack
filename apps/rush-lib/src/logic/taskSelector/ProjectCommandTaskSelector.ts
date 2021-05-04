// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { ProjectBuilder } from '../taskRunner/ProjectBuilder';
import { TaskCollection } from '../taskRunner/TaskCollection';
import { ITaskSelectorOptions, TaskSelectorBase } from './TaskSelectorBase';

export interface IProjectCommandTaskSelectorOptions {
  commandName: string;
  commandToRun: string;
  customParameterValues: string[];
  isIncrementalBuildAllowed: boolean;
  ignoreMissingScript: boolean;
  ignoreDependencyOrder: boolean;
  packageDepsFilename: string;
}

export class ProjectCommandTaskSelector extends TaskSelectorBase {
  private _projectCommandOptions: IProjectCommandTaskSelectorOptions;

  public constructor(
    options: ITaskSelectorOptions,
    projectCommandOptions: IProjectCommandTaskSelectorOptions
  ) {
    super(options);

    this._projectCommandOptions = projectCommandOptions;
  }

  protected _createTaskCollection(projects: ReadonlySet<RushConfigurationProject>): TaskCollection {
    const taskCollection: TaskCollection = new TaskCollection();

    // Register all tasks
    for (const rushProject of projects) {
      this._registerProjectTask(rushProject, taskCollection);
    }

    if (!this._projectCommandOptions.ignoreDependencyOrder) {
      const dependencyMap: Map<RushConfigurationProject, Set<string>> = new Map();

      // Generate the filtered dependency graph for selected projects
      function getDependencyTaskNames(project: RushConfigurationProject): Set<string> {
        const cached: Set<string> | undefined = dependencyMap.get(project);
        if (cached) {
          return cached;
        }

        const dependencyTaskNames: Set<string> = new Set();
        dependencyMap.set(project, dependencyTaskNames);

        for (const dep of project.dependencyProjects) {
          if (projects.has(dep)) {
            // Add direct relationships for projects in the set
            dependencyTaskNames.add(ProjectBuilder.getTaskName(dep));
          } else {
            // Add indirect relationships for projects not in the set
            for (const indirectDep of getDependencyTaskNames(dep)) {
              dependencyTaskNames.add(indirectDep);
            }
          }
        }

        return dependencyTaskNames;
      }

      // Add ordering relationships for each dependency
      for (const project of projects) {
        taskCollection.addDependencies(ProjectBuilder.getTaskName(project), getDependencyTaskNames(project));
      }
    }

    return taskCollection;
  }

  private _registerProjectTask(
    project: RushConfigurationProject | undefined,
    taskCollection: TaskCollection
  ): void {
    if (!project || taskCollection.hasTask(ProjectBuilder.getTaskName(project))) {
      return;
    }

    const commandToRun: string | undefined = TaskSelectorBase.getScriptToRun(
      project,
      this._projectCommandOptions.commandToRun,
      this._projectCommandOptions.customParameterValues
    );
    if (commandToRun === undefined && !this._projectCommandOptions.ignoreMissingScript) {
      throw new Error(
        `The project [${project.packageName}] does not define a '${this._projectCommandOptions.commandToRun}' command in the 'scripts' section of its package.json`
      );
    }

    taskCollection.addTask(
      new ProjectBuilder({
        rushProject: project,
        rushConfiguration: this._options.rushConfiguration,
        buildCacheConfiguration: this._options.buildCacheConfiguration,
        commandToRun: commandToRun || '',
        commandName: this._projectCommandOptions.commandName,
        isIncrementalBuildAllowed: this._projectCommandOptions.isIncrementalBuildAllowed,
        packageChangeAnalyzer: this._packageChangeAnalyzer,
        packageDepsFilename: this._projectCommandOptions.packageDepsFilename
      })
    );
  }
}
