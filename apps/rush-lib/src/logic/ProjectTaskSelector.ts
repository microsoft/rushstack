// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { RushConfigurationProject } from '../api/RushConfigurationProject';
import type { IPhase } from '../api/CommandLineConfiguration';
import type { Task } from './taskExecution/Task';

export interface IProjectTaskSelectorOptions {
  phasesToRun: ReadonlySet<IPhase>;
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
  tasks: Set<Task> | undefined;
  isCacheWriteAllowed: boolean;
}

interface ITaskNode {
  key: string;
  phase: IPhase;
  project: RushConfigurationProject;
}

interface ISelectedTaskNode extends ITaskNode {
  task: Task;
}

/**
 * This class is responsible for transforming a set of selected phases and selected projects into a task dependency graph.
 */
export class ProjectTaskSelector {
  private readonly _phasesToRun: ReadonlySet<IPhase>;

  public constructor(options: IProjectTaskSelectorOptions) {
    this._phasesToRun = options.phasesToRun;
  }

  public createTasks(createTasksOptions: ICreateTasksOptions): Set<Task> {
    const { projectSelection, taskFactory } = createTasksOptions;

    const selectedNodes: Map<string, ISelectedTaskNode> = new Map();
    const selectedTasks: Set<Task> = new Set();

    // Create tasks for selected phases and projects
    for (const phase of this._phasesToRun) {
      for (const project of projectSelection) {
        const task: Task = taskFactory.createTask({
          phase,
          project
        });

        const key: string = getTaskKey(phase, project);

        const record: ISelectedTaskNode = {
          key,
          phase,
          project,
          task
        };

        selectedNodes.set(key, record);
        selectedTasks.add(task);
      }
    }

    // Convert the [IPhase, RushConfigurationProject] into a value suitable for use as a Map key
    function getTaskKey(phase: IPhase, project: RushConfigurationProject): string {
      return `${project.packageName};${phase.name}`;
    }

    /**
     * Enumerates the declared dependencies
     */
    function* getRawDependencies(node: ITaskNode): Iterable<ITaskNode> {
      const {
        phase: {
          phaseDependencies: { self, upstream }
        },
        project
      } = node;

      for (const depPhase of self) {
        // Different phase, same project
        yield {
          key: getTaskKey(depPhase, project),
          phase: depPhase,
          project
        };
      }

      if (upstream.size) {
        const { dependencyProjects } = project;
        if (dependencyProjects.size) {
          for (const depPhase of upstream) {
            for (const dependencyProject of dependencyProjects) {
              yield {
                key: getTaskKey(depPhase, dependencyProject),
                phase: depPhase,
                project: dependencyProject
              };
            }
          }
        }
      }
    }

    const filteredDependencyCache: Map<string, ITaskDependencies> = new Map();
    function getFilteredDependencies(node: ITaskNode): ITaskDependencies {
      const { key } = node;
      const cached: ITaskDependencies | undefined = filteredDependencyCache.get(key);
      if (cached) {
        return cached;
      }

      const dependencies: ITaskDependencies = {
        tasks: undefined,
        isCacheWriteAllowed: selectedNodes.has(key)
      };

      filteredDependencyCache.set(key, dependencies);

      for (const dep of getRawDependencies(node)) {
        const selectedRecord: ISelectedTaskNode | undefined = selectedNodes.get(dep.key);
        if (selectedRecord) {
          // This task is part of the current execution
          if (!dependencies.tasks) {
            dependencies.tasks = new Set();
          }
          dependencies.tasks.add(selectedRecord.task);
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
    for (const record of selectedNodes.values()) {
      const deps: ITaskDependencies = getFilteredDependencies(record);
      if (deps.tasks) {
        for (const dependencyTask of deps.tasks) {
          record.task.dependencies.add(dependencyTask);
          dependencyTask.dependents.add(record.task);
        }
      }

      record.task.runner.isCacheWriteAllowed = deps.isCacheWriteAllowed;
    }

    return selectedTasks;
  }
}
