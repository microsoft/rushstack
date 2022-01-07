// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { BuildCacheConfiguration } from '../api/BuildCacheConfiguration';
import { RushConfiguration } from '../api/RushConfiguration';
import { RushConfigurationProject } from '../api/RushConfigurationProject';
import { convertSlashesForWindows, ProjectTaskRunner } from './taskExecution/ProjectTaskRunner';
import { ProjectChangeAnalyzer } from './ProjectChangeAnalyzer';
import { TaskCollection } from './taskExecution/TaskCollection';
import { IPhase } from '../api/CommandLineConfiguration';
import { RushConstants } from './RushConstants';
import { IRegisteredCustomParameter } from '../cli/scriptActions/BaseScriptAction';

export interface IProjectTaskSelectorOptions {
  rushConfiguration: RushConfiguration;
  buildCacheConfiguration: BuildCacheConfiguration | undefined;
  projectSelection: ReadonlySet<RushConfigurationProject>;
  isQuietMode: boolean;
  isDebugMode: boolean;
  isIncrementalBuildAllowed: boolean;
  projectChangeAnalyzer?: ProjectChangeAnalyzer;
  customParameters: IRegisteredCustomParameter[];

  phasesToRun: Iterable<string>;
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
  private readonly _phasesToRun: Iterable<string>;
  private readonly _phases: Map<string, IPhase>;
  private readonly _customParametersByPhaseName: Map<string, string[]>;

  public constructor(options: IProjectTaskSelectorOptions) {
    this._options = options;
    this._projectChangeAnalyzer =
      options.projectChangeAnalyzer || new ProjectChangeAnalyzer(options.rushConfiguration);
    this._phasesToRun = options.phasesToRun;
    this._phases = options.phases;
    this._customParametersByPhaseName = new Map();
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

    const selectedDependenciesCache: Map<RushConfigurationProject, Set<RushConfigurationProject>> = new Map();
    function getSelectedDependencies(project: RushConfigurationProject): Set<RushConfigurationProject> {
      let selectedDependencies: Set<RushConfigurationProject> | undefined =
        selectedDependenciesCache.get(project);
      if (selectedDependencies) {
        return selectedDependencies;
      }

      selectedDependencies = new Set();
      selectedDependenciesCache.set(project, selectedDependencies);

      for (const dependency of project.dependencyProjects) {
        if (projects.has(dependency)) {
          // The tasks for this project are part of the set. Preserve dependency as-is
          selectedDependencies.add(dependency);
        } else {
          // This project is not part of the set, but some of its dependencies could be.
          for (const indirectDependency of getSelectedDependencies(dependency)) {
            selectedDependencies.add(indirectDependency);
          }
        }
      }

      return selectedDependencies;
    }

    // Register all tasks
    // This currently does not correctly handle the scenario in which a phase is skipped.
    // If that happens, the dependency graph will have an error due to a missing task.
    for (const phaseName of this._phasesToRun) {
      const phase: IPhase = this._getPhaseByName(phaseName);
      for (const project of projects) {
        const taskName: string = this._getPhaseDisplayNameForProject(phase, project);

        const customParameterValues: string[] = this._getCustomParameterValuesForPhase(phase);
        const commandToRun: string | undefined = ProjectTaskSelector.getScriptToRun(
          project,
          phase.name,
          customParameterValues
        );
        if (commandToRun === undefined && !phase.ignoreMissingScript) {
          throw new Error(
            `The project '${project.packageName}' does not define a '${phase.name}' command in the 'scripts' section of its package.json`
          );
        }

        taskCollection.addTask(
          new ProjectTaskRunner({
            rushProject: project,
            taskName,
            rushConfiguration: this._options.rushConfiguration,
            buildCacheConfiguration: this._options.buildCacheConfiguration,
            commandToRun: commandToRun || '',
            isIncrementalBuildAllowed: this._options.isIncrementalBuildAllowed,
            projectChangeAnalyzer: this._projectChangeAnalyzer,
            phase
          })
        );

        const dependencyTasks: Set<string> = new Set();
        if (phase.dependencies?.self) {
          for (const dependencyPhaseName of phase.dependencies.self) {
            const dependencyPhase: IPhase = this._getPhaseByName(dependencyPhaseName);
            const dependencyTaskName: string = this._getPhaseDisplayNameForProject(dependencyPhase, project);

            dependencyTasks.add(dependencyTaskName);
          }
        }

        if (phase.dependencies?.upstream) {
          for (const dependencyPhaseName of phase.dependencies.upstream) {
            const dependencyPhase: IPhase = this._getPhaseByName(dependencyPhaseName);
            for (const dependencyProject of getSelectedDependencies(project)) {
              const dependencyTaskName: string = this._getPhaseDisplayNameForProject(
                dependencyPhase,
                dependencyProject
              );

              dependencyTasks.add(dependencyTaskName);
            }
          }
        }

        taskCollection.addDependencies(taskName, dependencyTasks);
      }
    }

    return taskCollection;
  }

  private _getPhaseByName(phaseName: string): IPhase {
    const phase: IPhase | undefined = this._phases.get(phaseName);
    if (!phase) {
      throw new Error(`Phase ${phaseName} not found`);
    }

    return phase;
  }

  private _getPhaseDisplayNameForProject(phase: IPhase, project: RushConfigurationProject): string {
    if (phase.isSynthetic) {
      // Because this is a synthetic phase, just use the project name because there aren't any other phases
      return project.packageName;
    } else {
      const phaseNameWithoutPrefix: string = phase.name.substring(RushConstants.phaseNamePrefix.length);
      return `${project.packageName} (${phaseNameWithoutPrefix})`;
    }
  }

  private _getCustomParameterValuesForPhase(phase: IPhase): string[] {
    let customParameterValues: string[] | undefined = this._customParametersByPhaseName.get(phase.name);
    if (customParameterValues === undefined) {
      customParameterValues = [];
      for (const { tsCommandLineParameter, parameter } of this._options.customParameters) {
        if (phase.associatedParameters.has(parameter)) {
          tsCommandLineParameter.appendToArgList(customParameterValues);
        }
      }

      this._customParametersByPhaseName.set(phase.name, customParameterValues);
    }

    return customParameterValues;
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
