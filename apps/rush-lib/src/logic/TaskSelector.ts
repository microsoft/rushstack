import { RushConfiguration, IRushLinkJson } from '../api/RushConfiguration';
import { RushConfigurationProject } from '../api/RushConfigurationProject';
import { JsonFile } from '@rushstack/node-core-library';

import { ProjectTask, convertSlashesForWindows } from '../logic/taskRunner/ProjectTask';
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
  private _dependentList: Map<string, Set<string>>;
  private _rushLinkJson: IRushLinkJson;
  private _options: ITaskSelectorConstructor;
  private _packageChangeAnalyzer: PackageChangeAnalyzer;

  public constructor(options: ITaskSelectorConstructor) {
    this._options = options;

    this._packageChangeAnalyzer = new PackageChangeAnalyzer(options.rushConfiguration);
    this._taskCollection = new TaskCollection({
      quietMode: options.isQuietMode
    });

    try {
      this._rushLinkJson = JsonFile.load(this._options.rushConfiguration.rushLinkJsonFilename);
    } catch (error) {
      throw new Error(
        `Could not read "${this._options.rushConfiguration.rushLinkJsonFilename}".` +
          ` Did you run "rush install" or "rush update"?`
      );
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
    const dependencies: Set<string> = new Set<string>();

    for (const toFlag of toFlags) {
      const toProject:
        | RushConfigurationProject
        | undefined = this._options.rushConfiguration.findProjectByShorthandName(toFlag);
      if (!toProject) {
        throw new Error(`The project '${toFlag}' does not exist in rush.json`);
      }

      this._collectAllDependencies(toProject.packageName, dependencies);
    }

    // Register any dependencies it may have
    for (const dependency of dependencies) {
      this._registerTask(this._options.rushConfiguration.getProjectByName(dependency));
    }

    if (!this._options.ignoreDependencyOrder) {
      // Add ordering relationships for each dependency
      for (const dependency of dependencies) {
        this._taskCollection.addDependencies(dependency, this._rushLinkJson.localLinks[dependency] || []);
      }
    }
  }

  private _registerFromFlags(fromFlags: ReadonlyArray<string>): void {
    this._buildDependentGraph();
    const dependents: Set<string> = new Set<string>();

    for (const fromFlag of fromFlags) {
      const fromProject:
        | RushConfigurationProject
        | undefined = this._options.rushConfiguration.findProjectByShorthandName(fromFlag);
      if (!fromProject) {
        throw new Error(`The project '${fromFlag}' does not exist in rush.json`);
      }

      this._collectAllDependents(fromProject.packageName, dependents);
    }

    // Register all downstream dependents
    for (const dependent of dependents) {
      this._registerTask(this._options.rushConfiguration.getProjectByName(dependent));
    }

    if (!this._options.ignoreDependencyOrder) {
      // Only add ordering relationships for projects which have been registered
      // e.g. package C may depend on A & B, but if we are only building A's downstream, we will ignore B
      for (const dependent of dependents) {
        this._taskCollection.addDependencies(
          dependent,
          (this._rushLinkJson.localLinks[dependent] || []).filter((dep) => dependents.has(dep))
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
      for (const projectName of Object.keys(this._rushLinkJson.localLinks)) {
        this._taskCollection.addDependencies(projectName, this._rushLinkJson.localLinks[projectName]);
      }
    }
  }

  /**
   * Collects all upstream dependencies for a certain project
   */
  private _collectAllDependencies(project: string, result: Set<string>): void {
    if (!result.has(project)) {
      result.add(project);

      for (const dependency of this._rushLinkJson.localLinks[project] || []) {
        this._collectAllDependencies(dependency, result);
      }
    }
  }

  /**
   * Collects all downstream dependents of a certain project
   */
  private _collectAllDependents(project: string, result: Set<string>): void {
    if (!result.has(project)) {
      result.add(project);

      for (const dependent of this._dependentList.get(project) || new Set<string>()) {
        this._collectAllDependents(dependent, result);
      }
    }
  }

  /**
   * Inverts the localLinks to arrive at the dependent graph. This helps when using the --from flag
   */
  private _buildDependentGraph(): void {
    this._dependentList = new Map<string, Set<string>>();

    for (const project of Object.keys(this._rushLinkJson.localLinks)) {
      for (const dep of this._rushLinkJson.localLinks[project]) {
        if (!this._dependentList.has(dep)) {
          this._dependentList.set(dep, new Set<string>());
        }

        this._dependentList.get(dep)!.add(project);
      }
    }
  }

  private _registerTask(project: RushConfigurationProject | undefined): void {
    if (project) {
      const projectTask: ProjectTask = new ProjectTask({
        rushProject: project,
        rushConfiguration: this._options.rushConfiguration,
        commandToRun: this._getScriptToRun(project),
        isIncrementalBuildAllowed: this._options.isIncrementalBuildAllowed,
        packageChangeAnalyzer: this._packageChangeAnalyzer,
        packageDepsFilename: this._options.packageDepsFilename
      });

      if (!this._taskCollection.hasTask(projectTask.name)) {
        this._taskCollection.addTask(projectTask);
      }
    }
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
