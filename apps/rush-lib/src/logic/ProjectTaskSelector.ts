// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { RushConfigurationProject } from '../api/RushConfigurationProject';
import type { IPhase } from '../api/CommandLineConfiguration';
import type { Task } from './taskExecution/Task';

export interface IProjectTaskSelectorOptions {
  phasesToRun: ReadonlySet<IPhase>;
  phases: Map<string, IPhase>;
  projects: ReadonlyArray<RushConfigurationProject>;
}

export interface ICreateTasksOptions {
  projectSelection: ReadonlySet<RushConfigurationProject>;
  taskFactory: IProjectTaskFactory;
}

export interface IProjectTaskOptions {
  project: RushConfigurationProject;
  phase: IPhase;
}

export interface IProjectTaskFactory {
  createTask(options: IProjectTaskOptions): Task;
}

interface ITaskDependencies {
  tasks: Set<number>;
  isCacheWriteAllowed: boolean;
}

/**
 * This class is responsible for transforming a set of selected phases and selected projects into a task dependency graph.
 */
export class ProjectTaskSelector {
  private readonly _phasesToRun: ReadonlySet<IPhase>;
  private readonly _knownPhases: ReadonlyArray<IPhase>;
  private readonly _knownProjects: ReadonlyArray<RushConfigurationProject>;

  public constructor(options: IProjectTaskSelectorOptions) {
    this._knownProjects = options.projects;
    this._phasesToRun = options.phasesToRun;
    this._knownPhases = Array.from(options.phases.values());
  }

  public createTasks(createTasksOptions: ICreateTasksOptions): Set<Task> {
    const { projectSelection, taskFactory } = createTasksOptions;

    const ordinalProjects: ReadonlyArray<RushConfigurationProject> = this._knownProjects;
    const ordinalPhases: ReadonlyArray<IPhase> = this._knownPhases;
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

      for (const project of projectSelection) {
        const task: Task = taskFactory.createTask({
          phase,
          project
        });

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
}
