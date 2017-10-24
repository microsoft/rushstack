import {
  RushConfiguration,
  RushConfigurationProject,
  IRushLinkJson
} from '../../index';
import { JsonFile } from '@microsoft/node-core-library';

import TaskRunner from '../taskRunner/TaskRunner';
import ProjectBuildTask from '../taskRunner/ProjectBuildTask';

export class TaskManager {
  private _taskRunner: TaskRunner;
  private _dependentList: Map<string, Set<string>>;
  private _rushLinkJson: IRushLinkJson;

  constructor(
    private _rushConfiguration: RushConfiguration,
    toFlags: Array<string>,
    fromFlags: Array<string>,
    private _commandToRun: string,
    private _customFlags: string[],
    isQuietMode: boolean,
    parallelism: number,
    private _isIncrementalBuildAllowed: boolean) {

    this._taskRunner = new TaskRunner(isQuietMode, parallelism);
    this._rushLinkJson = JsonFile.load(this._rushConfiguration.rushLinkJsonFilename);

    if (toFlags) {
      this._registerToFlags(toFlags);
    }
    if (fromFlags) {
      this._registerFromFlags(fromFlags);
    }
    if (!toFlags && !fromFlags) {
      this._registerAll();
    }
  }

  public execute(): Promise<void> {
    return this._taskRunner.execute();
  }

  private _registerToFlags(toFlags: string[]): void {
    for (const toFlag of toFlags) {
      const toProject: RushConfigurationProject | undefined =
        this._rushConfiguration.findProjectByShorthandName(toFlag);
      if (!toProject) {
        throw new Error(`The project '${toFlag}' does not exist in rush.json`);
      }

      const deps: Set<string> = this._collectAllDependencies(toProject.packageName);

      // Register any dependencies it may have
      deps.forEach(dep => this._registerTask(this._rushConfiguration.getProjectByName(dep)));

      // Register the dependency graph to the TaskRunner
      deps.forEach(dep => this._taskRunner.addDependencies(dep, this._rushLinkJson.localLinks[dep] || []));
    }
  }

  private _registerFromFlags(fromFlags: string[]): void {
    for (const fromFlag of fromFlags) {
      const fromProject: RushConfigurationProject | undefined
        = this._rushConfiguration.findProjectByShorthandName(fromFlag);
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
        this._registerTask(this._rushConfiguration.getProjectByName(dependent));
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
    for (const rushProject of this._rushConfiguration.projects) {
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
        this._rushConfiguration,
        this._commandToRun,
        this._customFlags,
        this._isIncrementalBuildAllowed);

      if (!this._taskRunner.hasTask(projectTask.name)) {
        this._taskRunner.addTask(projectTask);
      }
    }
  }
}