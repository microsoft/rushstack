// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { BuildCacheConfiguration } from '../api/BuildCacheConfiguration';
import { RushConfiguration } from '../api/RushConfiguration';
import { RushConfigurationProject } from '../api/RushConfigurationProject';
import { convertSlashesForWindows, ProjectTaskRunner } from './taskExecution/ProjectTaskRunner';
import { ProjectChangeAnalyzer } from './ProjectChangeAnalyzer';
import { TaskCollection } from './taskExecution/TaskCollection';
import { IPhase } from '../api/CommandLineConfiguration';
import { EnvironmentConfiguration } from '..';

export interface IProjectTaskSelectorOptions {
  rushConfiguration: RushConfiguration;
  buildCacheConfiguration: BuildCacheConfiguration | undefined;
  projectSelection: ReadonlySet<RushConfigurationProject>;
  customParameterValues: string[];
  isQuietMode: boolean;
  isDebugMode: boolean;
  isIncrementalBuildAllowed: boolean;
  projectChangeAnalyzer?: ProjectChangeAnalyzer;

  phasesToRun: ReadonlyArray<string>;
  phases: Map<string, IPhase>;
}

/**
 * This class is responsible for:
 *  - based on to/from flags, solving the dependency graph and figuring out which projects need to be run
 *  - creating a ProjectBuilder for each project that needs to be built
 *  - registering the necessary ProjectBuilders with the TaskExecutionManager, which actually orchestrates execution
 */
export class ProjectTaskSelector {
  private readonly _options: IProjectTaskSelectorOptions;
  private readonly _projectChangeAnalyzer: ProjectChangeAnalyzer;
  private readonly _phasesToRun: ReadonlyArray<string>;
  private readonly _phases: Map<string, IPhase>;
  private readonly _overrideAllowWarnings: boolean = EnvironmentConfiguration.allowWarningsInSuccessfulBuild;

  public constructor(options: IProjectTaskSelectorOptions) {
    this._options = options;
    this._projectChangeAnalyzer =
      options.projectChangeAnalyzer || new ProjectChangeAnalyzer(options.rushConfiguration);
    this._phasesToRun = options.phasesToRun;
    this._phases = options.phases;
  }

  public static getScriptToRun(
    rushProject: RushConfigurationProject,
    commandToRun: string,
    customParameterValues: string[]
  ): string | undefined {
    const script: string | undefined = ProjectTaskSelector._getScriptCommand(rushProject, commandToRun);

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
    const projects: ReadonlySet<RushConfigurationProject> = this._options.projectSelection;
    const taskCollection: TaskCollection = new TaskCollection();

    // Register all tasks
    for (const phaseName of this._phasesToRun) {
      const phase: IPhase | undefined = this._phases.get(phaseName);
      if (!phase) {
        throw new Error(`Phase ${phaseName} not found`);
      }

      for (const rushProject of projects) {
        this._registerProjectPhaseTask(rushProject, phase, taskCollection);
      }
    }

    // TODO: Expand phase dependencies

    // if (!this._options.ignoreDependencyOrder) {
    //   const dependencyMap: Map<RushConfigurationProject, Set<string>> = new Map();

    //   // Generate the filtered dependency graph for selected projects
    //   function getDependencyTaskNames(project: RushConfigurationProject): Set<string> {
    //     const cached: Set<string> | undefined = dependencyMap.get(project);
    //     if (cached) {
    //       return cached;
    //     }

    //     const dependencyTaskNames: Set<string> = new Set();
    //     dependencyMap.set(project, dependencyTaskNames);

    //     for (const dep of project.dependencyProjects) {
    //       if (projects.has(dep)) {
    //         // Add direct relationships for projects in the set
    //         dependencyTaskNames.add(ProjectTaskSelector.getPhaseTaskNameForProject(dep));
    //       } else {
    //         // Add indirect relationships for projects not in the set
    //         for (const indirectDep of getDependencyTaskNames(dep)) {
    //           dependencyTaskNames.add(indirectDep);
    //         }
    //       }
    //     }

    //     return dependencyTaskNames;
    //   }

    //   // Add ordering relationships for each dependency
    //   for (const project of projects) {
    //     taskCollection.addDependencies(
    //       ProjectTaskSelector.getPhaseTaskNameForProject(project),
    //       getDependencyTaskNames(project)
    //     );
    //   }
    // }

    return taskCollection;
  }

  private _registerProjectPhaseTask(
    project: RushConfigurationProject,
    phase: IPhase,
    taskCollection: TaskCollection
  ): void {
    const taskName: string = ProjectTaskSelector.getPhaseTaskNameForProject(project, phase);
    if (taskCollection.hasTask(taskName)) {
      return;
    }

    const commandToRun: string | undefined = ProjectTaskSelector.getScriptToRun(
      project,
      phase.name,
      this._options.customParameterValues
    );
    if (commandToRun === undefined && !phase.ignoreMissingScript) {
      throw new Error(
        `The project [${project.packageName}] does not define a '${phase.name}' command in the 'scripts' section of its package.json`
      );
    }

    taskCollection.addTask(
      new ProjectTaskRunner({
        rushProject: project,
        taskName,
        rushConfiguration: this._options.rushConfiguration,
        buildCacheConfiguration: this._options.buildCacheConfiguration,
        commandToRun: commandToRun || '',
        commandName: phase.name,
        isIncrementalBuildAllowed: this._options.isIncrementalBuildAllowed,
        projectChangeAnalyzer: this._projectChangeAnalyzer,
        allowWarningsInSuccessfulBuild: this._overrideAllowWarnings || phase.allowWarningsOnSuccess,
        logFilenameIdentifier: phase.logFilenameIdentifier
      })
    );
  }

  /**
   * A helper method to determine the task name of a ProjectBuilder. Used when the task
   * name is required before a task is created.
   */
  public static getPhaseTaskNameForProject(rushProject: RushConfigurationProject, phase: IPhase): string {
    return `${rushProject.packageName} (${phase.name})`;
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
