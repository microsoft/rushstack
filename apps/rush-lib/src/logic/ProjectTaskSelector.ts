// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { RushConfigurationProject } from '../api/RushConfigurationProject';
import type { IPhase } from '../api/CommandLineConfiguration';
import type { Task } from './taskExecution/Task';

export interface IProjectTaskSelectorOptions {
  phasesToRun: ReadonlySet<IPhase>;
  phases: ReadonlyMap<string, IPhase>;
  projects: ReadonlyMap<string, RushConfigurationProject>;
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

type ITaskKey = string;

interface ITaskDependencies {
  tasks: Set<Task> | undefined;
  isCacheWriteAllowed: boolean;
}

/**
 * This class is responsible for transforming a set of selected phases and selected projects into a task dependency graph.
 */
export class ProjectTaskSelector {
  private readonly _phasesToRun: ReadonlySet<IPhase>;
  private readonly _knownPhases: ReadonlyMap<string, IPhase>;
  private readonly _knownProjects: ReadonlyMap<string, RushConfigurationProject>;

  public constructor(options: IProjectTaskSelectorOptions) {
    this._knownProjects = options.projects;
    this._phasesToRun = options.phasesToRun;
    this._knownPhases = options.phases;
  }

  public createTasks(createTasksOptions: ICreateTasksOptions): Set<Task> {
    const { projectSelection, taskFactory } = createTasksOptions;

    const knownProjects: ReadonlyMap<string, RushConfigurationProject> = this._knownProjects;
    const knownPhases: ReadonlyMap<string, IPhase> = this._knownPhases;

    const taskByKey: Map<ITaskKey, Task> = new Map();
    const selectedTasks: Set<Task> = new Set();

    // Create tasks for selected phases and projects
    for (const phase of this._phasesToRun) {
      for (const project of projectSelection) {
        const task: Task = taskFactory.createTask({
          phase,
          project
        });

        taskByKey.set(getTaskKey(phase, project), task);
        selectedTasks.add(task);
      }
    }

    // Convert the [IPhase, RushConfigurationProject] into a value suitable for use as a Map key
    function getTaskKey(phase: IPhase, project: RushConfigurationProject): ITaskKey {
      return `${project.packageName};${phase.name}`;
    }

    // Conver the Map key back to the [IPhase, RushConfigurationProject] tuple
    function getPhaseAndProject(key: ITaskKey): [IPhase, RushConfigurationProject] {
      const index: number = key.indexOf(';');
      const phase: IPhase = knownPhases.get(key.slice(index + 1))!;
      const project: RushConfigurationProject = knownProjects.get(key.slice(0, index))!;
      return [phase, project];
    }

    /**
     * Enumerates the declared dependencies of the task in (phase * project) key space
     * task_ordinal = (project_count * phase_index) + project._index
     */
    function* getRawDependencies(taskKey: ITaskKey): Iterable<ITaskKey> {
      const [
        {
          phaseDependencies: { self, upstream }
        },
        project
      ] = getPhaseAndProject(taskKey);

      for (const phase of self) {
        // Different phase, same project
        yield getTaskKey(phase, project);
      }

      if (upstream.size) {
        const { dependencyProjects } = project;
        if (dependencyProjects.size) {
          for (const phase of upstream) {
            for (const dependencyProject of dependencyProjects) {
              yield getTaskKey(phase, dependencyProject);
            }
          }
        }
      }
    }

    const filteredDependencyCache: Map<ITaskKey, ITaskDependencies> = new Map();
    function getFilteredDependencies(node: ITaskKey): ITaskDependencies {
      const cached: ITaskDependencies | undefined = filteredDependencyCache.get(node);
      if (cached) {
        return cached;
      }

      const dependencies: ITaskDependencies = {
        tasks: undefined,
        isCacheWriteAllowed: taskByKey.has(node)
      };

      filteredDependencyCache.set(node, dependencies);

      for (const dep of getRawDependencies(node)) {
        const task: Task | undefined = taskByKey.get(dep);
        if (task) {
          // This task is part of the current execution
          if (!dependencies.tasks) {
            dependencies.tasks = new Set();
          }
          dependencies.tasks.add(task);
        } else {
          // This task is not part of the current execution, but may have dependencies that are
          // Since a task has been excluded, we cannot guarantee the results, so it is cache unsafe
          dependencies.isCacheWriteAllowed = false;
          const { tasks: indirectDependencies }: ITaskDependencies = getFilteredDependencies(dep);
          if (indirectDependencies) {
            if (!dependencies.tasks) {
              dependencies.tasks = new Set();
            }

            for (const indirectDep of indirectDependencies) {
              dependencies.tasks.add(indirectDep);
            }
          }
        }
      }

      return dependencies;
    }

    // Add dependency relationships
    for (const [key, task] of taskByKey) {
      const deps: ITaskDependencies = getFilteredDependencies(key);
      if (deps.tasks) {
        for (const dependencyTask of deps.tasks) {
          task.dependencies.add(dependencyTask);
          dependencyTask.dependents.add(task);
        }
      }

      task.runner.isCacheWriteAllowed = deps.isCacheWriteAllowed;
    }

    return selectedTasks;
  }
}
