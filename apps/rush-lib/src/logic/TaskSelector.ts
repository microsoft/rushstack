// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { RushConfiguration } from '../api/RushConfiguration';
import { RushConfigurationProject } from '../api/RushConfigurationProject';
import { ProjectTask, convertSlashesForWindows } from '../logic/taskRunner/ProjectTask';
import { PackageChangeAnalyzer } from './PackageChangeAnalyzer';
import { TaskCollection } from './taskRunner/TaskCollection';

export interface ITaskSelectorConstructor {
  rushConfiguration: RushConfiguration;
  toProjects: ReadonlyArray<RushConfigurationProject>;
  fromProjects: ReadonlyArray<RushConfigurationProject>;
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
 *  - creating a ProjectTask for each project that needs to be built
 *  - registering the necessary ProjectTasks with the TaskRunner, which actually orchestrates execution
 */
export class TaskSelector {
  private _taskCollection: TaskCollection;
  private _dependentList: Map<string, Set<RushConfigurationProject>>;
  private _options: ITaskSelectorConstructor;
  private _packageChangeAnalyzer: PackageChangeAnalyzer;

  public constructor(options: ITaskSelectorConstructor) {
    this._options = options;

    this._packageChangeAnalyzer = new PackageChangeAnalyzer(options.rushConfiguration);
    this._taskCollection = new TaskCollection({
      quietMode: options.isQuietMode
    });
  }

  public registerTasks(): TaskCollection {
    if (this._options.toProjects.length > 0) {
      this._registerToProjects(this._options.toProjects);
    }
    if (this._options.fromProjects.length > 0) {
      this._registerFromProjects(this._options.fromProjects);
    }
    if (this._options.toProjects.length === 0 && this._options.fromProjects.length === 0) {
      this._registerAll();
    }

    return this._taskCollection;
  }

  private _registerToProjects(toProjects: ReadonlyArray<RushConfigurationProject>): void {
    const dependencies: Map<string, RushConfigurationProject> = new Map<string, RushConfigurationProject>();

    for (const toProject of toProjects) {
      this._collectAllDependencies(toProject, dependencies);
    }

    // Register any dependencies it may have
    for (const [, dependencyProject] of dependencies) {
      this._registerTask(dependencyProject);
    }

    if (!this._options.ignoreDependencyOrder) {
      // Add ordering relationships for each dependency
      for (const [, dependencyProject] of dependencies) {
        this._taskCollection.addDependencies(
          ProjectTask.getTaskName(dependencyProject),
          dependencyProject.localDependencyProjects.map((x) => ProjectTask.getTaskName(x))
        );
      }
    }
  }

  private _registerFromProjects(fromProjects: ReadonlyArray<RushConfigurationProject>): void {
    this._buildDependentGraph();
    const dependents: Map<string, RushConfigurationProject> = new Map<string, RushConfigurationProject>();

    for (const fromProject of fromProjects) {
      this._collectAllDependents(fromProject, dependents);
    }

    // Register all downstream dependents
    for (const [, dependentProject] of dependents) {
      this._registerTask(dependentProject);
    }

    if (!this._options.ignoreDependencyOrder) {
      // Only add ordering relationships for projects which have been registered
      // e.g. package C may depend on A & B, but if we are only building A's downstream, we will ignore B
      for (const [, dependentProject] of dependents) {
        this._taskCollection.addDependencies(
          ProjectTask.getTaskName(dependentProject),
          dependentProject.localDependencyProjects
            .filter((dep) => dependents.has(dep.packageName))
            .map((x) => ProjectTask.getTaskName(x))
        );
      }
    }
  }

  private _registerAll(): void {
    // Register all tasks
    for (const rushProject of this._options.rushConfiguration.projects) {
      this._registerTask(rushProject);
    }

    if (!this._options.ignoreDependencyOrder) {
      // Add ordering relationships for each dependency
      for (const project of this._options.rushConfiguration.projects) {
        this._taskCollection.addDependencies(
          ProjectTask.getTaskName(project),
          project.localDependencyProjects.map((x) => ProjectTask.getTaskName(x))
        );
      }
    }
  }

  /**
   * Collects all upstream dependencies for a certain project
   */
  private _collectAllDependencies(
    project: RushConfigurationProject,
    result: Map<string, RushConfigurationProject>
  ): void {
    if (!result.has(project.packageName)) {
      result.set(project.packageName, project);

      for (const dependencyProject of project.localDependencyProjects) {
        this._collectAllDependencies(dependencyProject, result);
      }
    }
  }

  /**
   * Collects all downstream dependents of a certain project
   */
  private _collectAllDependents(
    project: RushConfigurationProject,
    result: Map<string, RushConfigurationProject>
  ): void {
    if (!result.has(project.packageName)) {
      result.set(project.packageName, project);

      for (const dependent of this._dependentList.get(project.packageName) || []) {
        this._collectAllDependents(dependent, result);
      }
    }
  }

  /**
   * Inverts the localLinks to arrive at the dependent graph. This helps when using the --from flag
   */
  private _buildDependentGraph(): void {
    this._dependentList = new Map<string, Set<RushConfigurationProject>>();

    for (const project of this._options.rushConfiguration.projects) {
      for (const { packageName } of project.localDependencyProjects) {
        if (!this._dependentList.has(packageName)) {
          this._dependentList.set(packageName, new Set<RushConfigurationProject>());
        }

        this._dependentList.get(packageName)!.add(project);
      }
    }
  }

  private _registerTask(project: RushConfigurationProject | undefined): void {
    if (!project || this._taskCollection.hasTask(ProjectTask.getTaskName(project))) {
      return;
    }

    this._taskCollection.addTask(
      new ProjectTask({
        rushProject: project,
        rushConfiguration: this._options.rushConfiguration,
        commandToRun: this._getScriptToRun(project),
        isIncrementalBuildAllowed: this._options.isIncrementalBuildAllowed,
        packageChangeAnalyzer: this._packageChangeAnalyzer,
        packageDepsFilename: this._options.packageDepsFilename
      })
    );
  }

  private _getScriptToRun(rushProject: RushConfigurationProject): string {
    const script: string | undefined = this._getScriptCommand(rushProject, this._options.commandToRun);

    if (script === undefined && !this._options.ignoreMissingScript) {
      throw new Error(
        `The project [${rushProject.packageName}] does not define a '${this._options.commandToRun}' command in the 'scripts' section of its package.json`
      );
    }

    if (!script) {
      return '';
    }

    const taskCommand: string = `${script} ${this._options.customParameterValues.join(' ')}`;
    return process.platform === 'win32' ? convertSlashesForWindows(taskCommand) : taskCommand;
  }

  private _getScriptCommand(rushProject: RushConfigurationProject, script: string): string | undefined {
    if (!rushProject.packageJson.scripts) {
      return undefined;
    }

    const rawCommand: string = rushProject.packageJson.scripts[script];

    // eslint-disable-next-line @rushstack/no-null
    if (rawCommand === undefined || rawCommand === null) {
      return undefined;
    }

    return rawCommand;
  }
}
