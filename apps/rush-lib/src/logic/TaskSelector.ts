import {
  RushConfiguration,
  IRushLinkJson
} from '../api/RushConfiguration';
import { RushConfigurationProject } from '../api/RushConfigurationProject';
import { JsonFile } from '@microsoft/node-core-library';

import { ProjectTask } from '../logic/taskRunner/ProjectTask';
import { PackageChangeAnalyzer } from './PackageChangeAnalyzer';
import { TaskCollection } from './taskRunner/TaskCollection';

export interface ITaskSelectorConstructor {
  rushConfiguration: RushConfiguration;
  toFlags: ReadonlyArray<string>;
  fromFlags: ReadonlyArray<string>;
  commandToRun: string;
  customParameterValues: string[];
  isQuietMode: boolean;
  isIncrementalBuildAllowed: boolean;
  ignoreMissingScript: boolean;
  ignoreDependencyOrder: boolean;
}

/**
 * This class is responsible for:
 *  - based on to/from flags, solving the dependency graph and figuring out which projects need to be run
 *  - creating a ProjectTask for each project that needs to be built
 *  - registering the necessary ProjectTasks with the TaskRunner, which actually orchestrates execution
 *
 * This class is currently only used by CustomRushAction
 */
export class TaskSelector {
  private _taskCollection: TaskCollection;
  private _dependentList: Map<string, Set<string>>;
  private _rushLinkJson: IRushLinkJson;
  private _options: ITaskSelectorConstructor;
  private _packageChangeAnalyzer: PackageChangeAnalyzer;

  constructor(options: ITaskSelectorConstructor) {
    this._options = options;

    this._packageChangeAnalyzer = new PackageChangeAnalyzer(options.rushConfiguration);
    this._taskCollection = new TaskCollection({
      quietMode: options.isQuietMode
    });

    try {
      this._rushLinkJson = JsonFile.load(this._options.rushConfiguration.rushLinkJsonFilename);
    } catch (error) {
      throw new Error(`Could not read "${this._options.rushConfiguration.rushLinkJsonFilename}".`
        + ` Did you run "rush install" or "rush update"?`);
    }
  }

  public registerTasks(): TaskCollection {
    if (this._options.toFlags.length > 0) {
      this._registerToFlags(this._options.toFlags);
    }
    if (this._options.fromFlags.length > 0) {
      this._registerFromFlags(this._options.fromFlags);
    }
    if (this._options.toFlags.length === 0 && this._options.fromFlags.length === 0) {
      this._registerAll();
    }

    return this._taskCollection;
  }

  private _registerToFlags(toFlags: ReadonlyArray<string>): void {
    for (const toFlag of toFlags) {
      const toProject: RushConfigurationProject | undefined =
        this._options.rushConfiguration.findProjectByShorthandName(toFlag);
      if (!toProject) {
        throw new Error(`The project '${toFlag}' does not exist in rush.json`);
      }

      const deps: Set<string> = this._collectAllDependencies(toProject.packageName);

      // Register any dependencies it may have
      deps.forEach(dep => this._registerTask(this._options.rushConfiguration.getProjectByName(dep)));

      if (!this._options.ignoreDependencyOrder) {
        // Add ordering relationships for each dependency
        deps.forEach(dep => this._taskCollection.addDependencies(dep, this._rushLinkJson.localLinks[dep] || []));
      }
    }
  }

  private _registerFromFlags(fromFlags: ReadonlyArray<string>): void {
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

      if (!this._options.ignoreDependencyOrder) {
        // Only add ordering relationships for projects which have been registered
        // e.g. package C may depend on A & B, but if we are only building A's downstream, we will ignore B
        dependents.forEach(dependent =>
          this._taskCollection.addDependencies(dependent,
            (this._rushLinkJson.localLinks[dependent] || []).filter(dep => dependents.has(dep))));
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
      for (const projectName of Object.keys(this._rushLinkJson.localLinks)) {
        this._taskCollection.addDependencies(projectName, this._rushLinkJson.localLinks[projectName]);
      }
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
      const projectTask: ProjectTask = new ProjectTask({
        rushProject: project,
        rushConfiguration: this._options.rushConfiguration,
        commandToRun: this._options.commandToRun,
        customParameterValues: this._options.customParameterValues,
        isIncrementalBuildAllowed: this._options.isIncrementalBuildAllowed,
        ignoreMissingScript: this._options.ignoreMissingScript,
        packageChangeAnalyzer: this._packageChangeAnalyzer
      });

      if (!this._taskCollection.hasTask(projectTask.name)) {
        this._taskCollection.addTask(projectTask);
      }
    }
  }
}
