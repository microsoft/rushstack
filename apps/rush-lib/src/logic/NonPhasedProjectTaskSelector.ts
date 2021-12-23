// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ITaskSelectorOptions, ProjectTaskSelector } from './ProjectTaskSelectorBase';
import { RushConfigurationProject } from '../api/RushConfigurationProject';
import { TaskCollection } from './taskExecution/TaskCollection';
import { ProjectTaskRunner } from './taskExecution/ProjectTaskRunner';

export interface INonPhasedProjectTaskSelectorOptions extends ITaskSelectorOptions {}

export class NonPhasedProjectTaskSelector extends ProjectTaskSelector<INonPhasedProjectTaskSelectorOptions> {
  public registerTasks(): TaskCollection {
    const projects: ReadonlySet<RushConfigurationProject> = this._options.selection;
    const taskCollection: TaskCollection = new TaskCollection();

    // Register all tasks
    for (const rushProject of projects) {
      this._registerProjectTask(rushProject, taskCollection);
    }

    if (!this._options.ignoreDependencyOrder) {
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
            dependencyTaskNames.add(NonPhasedProjectTaskSelector.getTaskNameForProject(dep));
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
        taskCollection.addDependencies(
          NonPhasedProjectTaskSelector.getTaskNameForProject(project),
          getDependencyTaskNames(project)
        );
      }
    }

    return taskCollection;
  }

  private _registerProjectTask(project: RushConfigurationProject, taskCollection: TaskCollection): void {
    const taskName: string = NonPhasedProjectTaskSelector.getTaskNameForProject(project);
    if (taskCollection.hasTask(taskName)) {
      return;
    }

    const commandToRun: string | undefined = ProjectTaskSelector.getScriptToRun(
      project,
      this._options.commandToRun,
      this._options.customParameterValues
    );
    if (commandToRun === undefined && !this._options.ignoreMissingScript) {
      throw new Error(
        `The project [${project.packageName}] does not define a '${this._options.commandToRun}' command in the 'scripts' section of its package.json`
      );
    }

    taskCollection.addTask(
      new ProjectTaskRunner({
        rushProject: project,
        taskName,
        rushConfiguration: this._options.rushConfiguration,
        buildCacheConfiguration: this._options.buildCacheConfiguration,
        commandToRun: commandToRun || '',
        commandName: this._options.commandName,
        isIncrementalBuildAllowed: this._options.isIncrementalBuildAllowed,
        projectChangeAnalyzer: this._projectChangeAnalyzer,
        allowWarningsInSuccessfulBuild: this._options.allowWarningsInSuccessfulBuild,
        logFilenameIdentifier: this._options.logFilenameIdentifier
      })
    );
  }

  /**
   * A helper method to determine the task name of a ProjectBuilder. Used when the task
   * name is required before a task is created.
   */
  public static getTaskNameForProject(rushProject: RushConfigurationProject): string {
    return rushProject.packageName;
  }
}
