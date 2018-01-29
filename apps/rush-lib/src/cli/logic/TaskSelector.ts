import {
  default as RushConfiguration,
  IRushLinkJson
} from '../../data/RushConfiguration';
import { default as RushConfigurationProject } from '../../data/RushConfigurationProject';
import { JsonFile } from '@microsoft/node-core-library';

import TaskRunner from '../taskRunner/TaskRunner';
import ProjectBuildTask from '../taskRunner/ProjectBuildTask';

export interface ITaskSelectorConstructor {
  rushConfiguration: RushConfiguration;
  toFlags: Array<string>;
  fromFlags: Array<string>;
  commandToRun: string;
  customFlags: string[];
  isQuietMode: boolean;
  parallelism: number;
  isIncrementalBuildAllowed: boolean;
  changedProjectsOnly: boolean;
}

/**
 * This class is responsible for:
 *  - based on to/from flags, solving the dependency graph and figuring out which projects need to be run
 *  - creating a ProjectBuildTask for each project that needs to be built
 *  - registering the necessary ProjectBuildTasks with the TaskRunner, which actually orchestrates execution
 *
 * This class is currently only used by CustomRushAction
 */
export class TaskSelector {
  private _taskRunner: TaskRunner;
  private _dependentList: Map<string, Set<string>>;
  private _rushLinkJson: IRushLinkJson;

  constructor(private _options: ITaskSelectorConstructor) {

    this._taskRunner = new TaskRunner(
      this._options.isQuietMode,
      this._options.parallelism,
      this._options.changedProjectsOnly);

    try {
      this._rushLinkJson = JsonFile.load(this._options.rushConfiguration.rushLinkJsonFilename);
    } catch (error) {
      throw new Error(`Could not read "${this._options.rushConfiguration.rushLinkJsonFilename}".`
        + ` Have you ran "rush install" and/or "rush link"?`);
    }

    if (this._options.toFlags) {
      this._registerToFlags(this._options.toFlags);
    }
    if (this._options.fromFlags) {
      this._registerFromFlags(this._options.fromFlags);
    }
    if (!this._options.toFlags && !this._options.fromFlags) {
      this._registerAll();
    }
  }

  public execute(): Promise<void> {
    return this._taskRunner.execute();
  }

  private _registerToFlags(toFlags: string[]): void {
    for (const toFlag of toFlags) {
      const toProject: RushConfigurationProject | undefined =
        this._options.rushConfiguration.findProjectByShorthandName(toFlag);
      if (!toProject) {
        throw new Error(`The project '${toFlag}' does not exist in rush.json`);
      }

      const deps: Set<string> = this._collectAllDependencies(toProject.packageName);

      // Register any dependencies it may have
      deps.forEach(dep => this._registerTask(this._options.rushConfiguration.getProjectByName(dep)));

      // Register the dependency graph to the TaskRunner
      deps.forEach(dep => this._taskRunner.addDependencies(dep, this._rushLinkJson.localLinks[dep] || []));
    }
  }

  private _registerFromFlags(fromFlags: string[]): void {
    for (const fromFlag of fromFlags) {
      const fromProject: RushConfigurationProject | undefined
        = this._options.rushConfiguration.findProjectByShorthandName(fromFlag);
      if (!fromProject) {
        throw new Error(`The project '${fromFlag}' does not exist in rush.json`);
      }

      // Only register projects which depend on the current package, as well as things that depend on them
      this._buildDependentGraph();

      // We will assume this project will be built, but act like it has no dependencies
      const dependents: Set<string> = this._collectAllDependents(fromProject.packageName);
      dependents.add(fromProject.packageName);

      // Register all downstream dependents
      dependents.forEach(dependent => {
        this._registerTask(this._options.rushConfiguration.getProjectByName(dependent));
      });

      // Only register dependencies graph for projects which have been registered
      // e.g. package C may depend on A & B, but if we are only building A's downstream, we will ignore B
      dependents.forEach(dependent =>
        this._taskRunner.addDependencies(dependent,
          (this._rushLinkJson.localLinks[dependent] || []).filter(dep => dependents.has(dep))));
    }
  }

  private _registerAll(): void {
    // Register all tasks
    for (const rushProject of this._options.rushConfiguration.projects) {
      this._registerTask(rushProject);
    }

    // Add all dependencies
    for (const projectName of Object.keys(this._rushLinkJson.localLinks)) {
      this._taskRunner.addDependencies(projectName, this._rushLinkJson.localLinks[projectName]);
    }
  }

  /**
   * Collects all upstream dependencies for a certain project
   */
  private _collectAllDependencies(project: string): Set<string> {
    const deps: Set<string> = new Set<string>(this._rushLinkJson.localLinks[project]);
    deps.forEach(dep => this._collectAllDependencies(dep).forEach(innerDep => deps.add(innerDep)));
    deps.add(project);
    return deps;
  }

  /**
   * Collects all downstream dependents of a certain project
   */
  private _collectAllDependents(project: string): Set<string> {
    const deps: Set<string> = new Set<string>();
    (this._dependentList.get(project) || new Set<string>()).forEach((dep) => {
      deps.add(dep);
    });
    deps.forEach(dep => this._collectAllDependents(dep).forEach(innerDep => deps.add(innerDep)));
    return deps;
  }

  /**
   * Inverts the localLinks to arrive at the dependent graph, rather than using the dependency graph
   * this helps when using the --from flag
   */
  private _buildDependentGraph(): void {
    this._dependentList = new Map<string, Set<string>>();

    Object.keys(this._rushLinkJson.localLinks).forEach(project => {
      this._rushLinkJson.localLinks[project].forEach(dep => {
        if (!this._dependentList.has(dep)) {
          this._dependentList.set(dep, new Set<string>());
        }
        this._dependentList.get(dep)!.add(project);
      });
    });
  }

  private _registerTask(project: RushConfigurationProject | undefined): void {
    if (project) {

      const projectTask: ProjectBuildTask = new ProjectBuildTask(
        project,
        this._options.rushConfiguration,
        this._options.commandToRun,
        this._options.customFlags,
        this._options.isIncrementalBuildAllowed);

      if (!this._taskRunner.hasTask(projectTask.name)) {
        this._taskRunner.addTask(projectTask);
      }
    }
  }
}