// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { BuildCacheConfiguration } from '../api/BuildCacheConfiguration';
import { RushConfiguration } from '../api/RushConfiguration';
import { RushConfigurationProject } from '../api/RushConfigurationProject';
import { convertSlashesForWindows, ProjectTaskRunner } from './taskExecution/ProjectTaskRunner';
import { ProjectChangeAnalyzer } from './ProjectChangeAnalyzer';
import { IPhase } from '../api/CommandLineConfiguration';
import { RushConstants } from './RushConstants';
import { IRegisteredCustomParameter } from '../cli/scriptActions/BaseScriptAction';
import { Task } from './taskExecution/Task';
import { TaskStatus } from './taskExecution/TaskStatus';

export interface IProjectTaskSelectorOptions {
  rushConfiguration: RushConfiguration;
  buildCacheConfiguration: BuildCacheConfiguration | undefined;
  isQuietMode: boolean;
  isDebugMode: boolean;
  isIncrementalBuildAllowed: boolean;
  customParameters: IRegisteredCustomParameter[];

  phasesToRun: Iterable<IPhase>;
  phases: Map<string, IPhase>;
}

export interface ICreateTasksOptions {
  projectSelection: ReadonlySet<RushConfigurationProject>;
  projectChangeAnalyzer?: ProjectChangeAnalyzer;
}

interface ITaskDependencies {
  tasks: Set<number>;
  isCacheWriteAllowed: boolean;
}

/**
 * This class is responsible for:
 *  - based on to/from flags, solving the dependency graph and figuring out which projects need to be run
 *  - creating a ProjectBuilder for each project that needs to be built
 *  - registering the necessary ProjectBuilders with the TaskExecutionManager, which actually orchestrates execution
 */
export class ProjectTaskSelector {
  private readonly _options: IProjectTaskSelectorOptions;
  private readonly _phasesToRun: Set<IPhase>;
  private readonly _phases: IPhase[];
  private readonly _customParametersByPhase: Map<IPhase, string[]>;

  public constructor(options: IProjectTaskSelectorOptions) {
    this._options = options;
    this._phasesToRun = new Set(options.phasesToRun);
    this._phases = Array.from(options.phases.values());
    this._customParametersByPhase = new Map();
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

  public createTasks(createTasksOptions: ICreateTasksOptions): Set<Task> {
    const { rushConfiguration, buildCacheConfiguration, isIncrementalBuildAllowed } = this._options;

    const { projects: ordinalProjects } = rushConfiguration;

    const { projectSelection, projectChangeAnalyzer = new ProjectChangeAnalyzer(rushConfiguration) } =
      createTasksOptions;

    const ordinalPhases: IPhase[] = this._phases;
    const projectCount: number = ordinalProjects.length;

    const maxOrdinal: number = projectCount * ordinalPhases.length;
    // Note, this is 9007199254740991; performance will degrade to the point of uselessness long before hitting this number
    if (maxOrdinal > Number.MAX_SAFE_INTEGER) {
      throw new Error(
        `The product of the number of defined phases (${ordinalPhases.length}) and number of projects (${projectCount}) exceeds ${Number.MAX_SAFE_INTEGER}. This is not currently supported.`
      );
    }

    const taskByOrdinal: Map<number, Task> = new Map();

    // Create tasks for selected phases and projects
    for (const phase of this._phasesToRun) {
      const phaseOffset: number = phase.index * projectCount;

      const customParameterValues: string[] = this._getCustomParameterValuesForPhase(phase);

      for (const project of projectSelection) {
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

        if (commandToRun === undefined && !phase.ignoreMissingScript) {
          throw new Error(
            `The project [${project.packageName}] does not define a '${phase.name}' command in the 'scripts' section of its package.json`
          );
        }
        const taskName: string = this._getTaskDisplayName(phase, project);

        const task: Task = new Task(
          new ProjectTaskRunner({
            rushProject: project,
            taskName,
            rushConfiguration,
            buildCacheConfiguration,
            commandToRun: commandToRun || '',
            isIncrementalBuildAllowed,
            projectChangeAnalyzer,
            phase
          }),
          TaskStatus.Ready
        );

        taskByOrdinal.set(phaseOffset + project._index, task);
      }
    }

    /**
     * Enumerates the declared dependencies of the task in (phase * project) key space
     * task_ordinal = (project_count * phase_index) + project._index
     */
    function* getRawDependencies(taskOrdinal: number): Iterable<number> {
      const projectIndex: number = taskOrdinal % projectCount;

      const {
        phaseDependencies: { self, upstream }
      }: IPhase = ordinalPhases[Math.floor(taskOrdinal / projectCount)];
      const project: RushConfigurationProject = ordinalProjects[projectIndex];

      for (const phase of self) {
        // Different phase, same project
        yield phase.index * projectCount + projectIndex;
      }

      for (const phase of upstream) {
        const targetPhaseOffset: number = phase.index * projectCount;
        for (const dependencyProject of project.dependencyProjects) {
          yield targetPhaseOffset + dependencyProject._index;
        }
      }
    }

    const filteredDependencyCache: Map<number, ITaskDependencies> = new Map();
    function getFilteredDependencies(node: number): ITaskDependencies {
      const cached: ITaskDependencies | undefined = filteredDependencyCache.get(node);
      if (cached) {
        return cached;
      }

      const dependencies: ITaskDependencies = {
        tasks: new Set(),
        isCacheWriteAllowed: true
      };

      filteredDependencyCache.set(node, dependencies);

      for (const dep of getRawDependencies(node)) {
        if (taskByOrdinal.has(dep)) {
          // This task is part of the current execution
          dependencies.tasks.add(dep);
        } else {
          // This task is not part of the current execution, but may have dependencies that are
          // Since a task has been excluded, we cannot guarantee the results, so it is cache unsafe
          dependencies.isCacheWriteAllowed = false;
          const indirectDependencies: ITaskDependencies = getFilteredDependencies(dep);
          for (const indirectDep of indirectDependencies.tasks) {
            dependencies.tasks.add(indirectDep);
          }
        }
      }

      return dependencies;
    }

    // Add dependency relationships
    for (const [ordinal, task] of taskByOrdinal) {
      const deps: ITaskDependencies = getFilteredDependencies(ordinal);
      for (const dep of deps.tasks) {
        const dependencyTask: Task = taskByOrdinal.get(dep)!;
        task.dependencies.add(dependencyTask);
        dependencyTask.dependents.add(task);
      }

      task.runner.isCacheWriteAllowed = deps.isCacheWriteAllowed;
    }

    return new Set(taskByOrdinal.values());
  }

  private _getTaskDisplayName(phase: IPhase, project: RushConfigurationProject): string {
    if (phase.isSynthetic) {
      // Because this is a synthetic phase, just use the project name because there aren't any other phases
      return project.packageName;
    } else {
      const phaseNameWithoutPrefix: string = phase.name.slice(RushConstants.phaseNamePrefix.length);
      return `${project.packageName} (${phaseNameWithoutPrefix})`;
    }
  }

  private _getCustomParameterValuesForPhase(phase: IPhase): string[] {
    let customParameterValues: string[] | undefined = this._customParametersByPhase.get(phase);
    if (!customParameterValues) {
      customParameterValues = [];
      for (const { tsCommandLineParameter, parameter } of this._options.customParameters) {
        if (phase.associatedParameters.has(parameter)) {
          tsCommandLineParameter.appendToArgList(customParameterValues);
        }
      }

      this._customParametersByPhase.set(phase, customParameterValues);
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
