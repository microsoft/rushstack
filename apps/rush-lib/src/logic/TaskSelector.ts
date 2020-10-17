// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { BuildCacheConfiguration } from '../api/BuildCacheConfiguration';
import { RushConfiguration } from '../api/RushConfiguration';
import { RushConfigurationProject } from '../api/RushConfigurationProject';
import { ProjectBuilder, convertSlashesForWindows } from '../logic/taskRunner/ProjectBuilder';
import { ProjectChangeAnalyzer } from './ProjectChangeAnalyzer';
import { TaskCollection } from './taskRunner/TaskCollection';

export interface ITaskSelectorOptions {
  rushConfiguration: RushConfiguration;
  buildCacheConfiguration: BuildCacheConfiguration | undefined;
  selection: ReadonlySet<RushConfigurationProject>;
  commandName: string;
  commandToRun: string;
  customParameterValues: string[];
  isQuietMode: boolean;
  isDebugMode: boolean;
  isIncrementalBuildAllowed: boolean;
  ignoreMissingScript: boolean;
  ignoreDependencyOrder: boolean;
  packageDepsFilename: string;
  projectChangeAnalyzer?: ProjectChangeAnalyzer;
  allowWarningsInSuccessfulBuild?: boolean;
}

/**
 * This class is responsible for:
 *  - based on to/from flags, solving the dependency graph and figuring out which projects need to be run
 *  - creating a ProjectBuilder for each project that needs to be built
 *  - registering the necessary ProjectBuilders with the TaskRunner, which actually orchestrates execution
 */
export class TaskSelector {
  private _options: ITaskSelectorOptions;
  private _projectChangeAnalyzer: ProjectChangeAnalyzer;

  public constructor(options: ITaskSelectorOptions) {
    this._options = options;

    const { projectChangeAnalyzer = new ProjectChangeAnalyzer(options.rushConfiguration) } = options;

    this._projectChangeAnalyzer = projectChangeAnalyzer;
  }

  public static getScriptToRun(
    rushProject: RushConfigurationProject,
    commandToRun: string,
    customParameterValues: string[]
  ): string | undefined {
    const script: string | undefined = TaskSelector._getScriptCommand(rushProject, commandToRun);

    if (script === undefined) {
      return undefined;
    }

    if (!script) {
      return '';
    } else {
      const taskCommand: string = `${script} ${customParameterValues.join(' ')}`;
      return process.platform === 'win32' ? convertSlashesForWindows(taskCommand) : taskCommand;
    }
  }

  public registerTasks(): TaskCollection {
    const projects: ReadonlySet<RushConfigurationProject> = this._options.selection;
    const taskCollection: TaskCollection = new TaskCollection();

    // Register all tasks
    for (const rushProject of projects) {
      this._registerTask(rushProject, taskCollection);
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

  private _registerTask(project: RushConfigurationProject | undefined, taskCollection: TaskCollection): void {
    if (!project || taskCollection.hasTask(ProjectBuilder.getTaskName(project))) {
      return;
    }

    const commandToRun: string | undefined = TaskSelector.getScriptToRun(
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
      new ProjectBuilder({
        rushProject: project,
        rushConfiguration: this._options.rushConfiguration,
        buildCacheConfiguration: this._options.buildCacheConfiguration,
        commandToRun: commandToRun || '',
        commandName: this._options.commandName,
        isIncrementalBuildAllowed: this._options.isIncrementalBuildAllowed,
        projectChangeAnalyzer: this._projectChangeAnalyzer,
        packageDepsFilename: this._options.packageDepsFilename,
        allowWarningsInSuccessfulBuild: this._options.allowWarningsInSuccessfulBuild
      })
    );
  }

  private static _getScriptCommand(
    rushProject: RushConfigurationProject,
    script: string
  ): string | undefined {
    if (!rushProject.packageJson.scripts) {
      return undefined;
    }

    const rawCommand: string = rushProject.packageJson.scripts[script];

    if (rawCommand === undefined || rawCommand === null) {
      return undefined;
    }

    return rawCommand;
  }
}
