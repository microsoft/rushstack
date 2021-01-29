// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { BuildCacheConfiguration } from '../api/BuildCacheConfiguration';
import { RushConfiguration } from '../api/RushConfiguration';
import { RushConfigurationProject } from '../api/RushConfigurationProject';
import { ProjectBuilder, convertSlashesForWindows } from '../logic/taskRunner/ProjectBuilder';
import { PackageChangeAnalyzer } from './PackageChangeAnalyzer';
import { TaskCollection } from './taskRunner/TaskCollection';

export interface ITaskSelectorConstructor {
  rushConfiguration: RushConfiguration;
  buildCacheConfiguration: BuildCacheConfiguration | undefined;
  selection: Set<RushConfigurationProject>;
  commandToRun: string;
  customParameterValues: string[];
  isQuietMode: boolean;
  isIncrementalBuildAllowed: boolean;
  ignoreMissingScript: boolean;
  ignoreDependencyOrder: boolean;
  packageDepsFilename: string;
}

/**
 * This class is responsible for:
 *  - based on to/from flags, solving the dependency graph and figuring out which projects need to be run
 *  - creating a ProjectBuilder for each project that needs to be built
 *  - registering the necessary ProjectBuilders with the TaskRunner, which actually orchestrates execution
 */
export class TaskSelector {
  private _options: ITaskSelectorConstructor;
  private _packageChangeAnalyzer: PackageChangeAnalyzer;

  public constructor(options: ITaskSelectorConstructor) {
    this._options = options;

    this._packageChangeAnalyzer = new PackageChangeAnalyzer(options.rushConfiguration);
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
    const selectedProjects: Set<RushConfigurationProject> = this._computeSelectedProjects();

    return this._createTaskCollection(selectedProjects);
  }

  private _computeSelectedProjects(): Set<RushConfigurationProject> {
    const { selection } = this._options;

    if (selection.size) {
      return selection;
    }

    // Default to all projects
    return new Set(this._options.rushConfiguration.projects);
  }

  private _createTaskCollection(projects: ReadonlySet<RushConfigurationProject>): TaskCollection {
    const taskCollection: TaskCollection = new TaskCollection();

    // Register all tasks
    for (const rushProject of projects) {
      this._registerTask(rushProject, taskCollection);
    }

    function* getDependencyTaskNames(project: RushConfigurationProject): Iterable<string> {
      for (const dep of project.localDependencyProjectSet) {
        // Only add relationships for projects in the set
        if (projects.has(dep)) {
          yield ProjectBuilder.getTaskName(dep);
        }
      }
    }

    if (!this._options.ignoreDependencyOrder) {
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
        isIncrementalBuildAllowed: this._options.isIncrementalBuildAllowed,
        packageChangeAnalyzer: this._packageChangeAnalyzer,
        packageDepsFilename: this._options.packageDepsFilename
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
