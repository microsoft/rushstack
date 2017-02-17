// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';
import * as fsx from 'fs-extra';
import * as os from 'os';
import {
  CommandLineAction,
  CommandLineFlagParameter,
  CommandLineIntegerParameter,
  CommandLineStringListParameter,
  ICommandLineActionOptions
} from '@microsoft/ts-command-line';
import {
  ErrorDetectionMode,
  ErrorDetector,
  IErrorDetectionRule,
  IRushLinkJson,
  JsonFile,
  RushConfiguration,
  RushConfigurationProject,
  Stopwatch,
  TestErrorDetector,
  TsErrorDetector,
  TsLintErrorDetector
} from '@microsoft/rush-lib';

import TaskRunner from '../taskRunner/TaskRunner';
import ProjectBuildTask from '../taskRunner/ProjectBuildTask';
import RushCommandLineParser from './RushCommandLineParser';

export default class RebuildAction extends CommandLineAction {

  /**
   * Defines the default state of forced (aka clean) build, where we do not try and compare
   * dependencies to evaluate if we need to build or not.
   */
  protected _isIncrementalBuildAllowed: boolean;

  private _dependentList: Map<string, Set<string>>;
  private _fromFlag: CommandLineStringListParameter;
  private _npmParameter: CommandLineFlagParameter;
  private _rushConfiguration: RushConfiguration;
  private _rushLinkJson: IRushLinkJson;
  private _parallelismParameter: CommandLineIntegerParameter;
  private _parser: RushCommandLineParser;
  private _productionParameter: CommandLineFlagParameter;
  private _quietParameter: CommandLineFlagParameter;
  private _toFlag: CommandLineStringListParameter;
  private _vsoParameter: CommandLineFlagParameter;
  private _minimalParameter: CommandLineFlagParameter;
  private _verboseParameter: CommandLineFlagParameter;
  private _veryVerboseParameter: CommandLineFlagParameter;

  constructor(parser: RushCommandLineParser, options?: ICommandLineActionOptions) {
    super(options || {
      actionVerb: 'rebuild',
      summary: 'Clean and rebuild the entire set of projects',
      documentation: 'The Rush rebuild command assumes that the package.json file for each'
      + ' project will contain scripts for "npm run clean" and "npm run test".  It invokes'
      + ' these commands to build each project.  Projects are built in parallel where'
      + ' possible, but always respecting the dependency graph for locally linked projects.'
      + ' The number of simultaneous processes will be equal to the number of machine cores.'
      + ' unless overriden by the --parallelism flag.'
    });
    this._parser = parser;
    this._isIncrementalBuildAllowed = false;
  }

  protected onDefineParameters(): void {
    this._quietParameter = this.defineFlagParameter({
      parameterLongName: '--quiet',
      parameterShortName: '-q',
      description: 'Only show errors and overall build status'
    });
    this._productionParameter = this.defineFlagParameter({
      parameterLongName: '--production',
      description: 'Perform a production build'
    });
    this._vsoParameter = this.defineFlagParameter({
      parameterLongName: '--vso',
      description: 'Display error messages in the format expected by Visual Studio Online'
    });
    this._npmParameter = this.defineFlagParameter({
      parameterLongName: '--npm',
      description: 'Perform a npm-mode build. Designed for building code for distribution on NPM'
    });
    this._parallelismParameter = this.defineIntegerParameter({
      parameterLongName: '--parallelism',
      parameterShortName: '-p',
      description: 'Change the limit the number of active builds from number of machine cores'
      + ' to N simultaneous processes'
    });
    this._toFlag = this.defineStringListParameter({
      parameterLongName: '--to',
      parameterShortName: '-t',
      description: 'Build all dependencies of the listed project'
    });
    this._fromFlag = this.defineStringListParameter({
      parameterLongName: '--from',
      parameterShortName: '-f',
      description: 'Build all projects which are downstream from the listed project'
    });
    this._minimalParameter = this.defineFlagParameter({
      parameterLongName: '--minimal',
      parameterShortName: '-m',
      description: 'Invokes the build script with the "--minimal" option, which speeds up the build by running the ' +
        'minimal set of tasks required to produce an executable output'
    });
    this._verboseParameter = this.defineFlagParameter({
      parameterLongName: '--verbose',
      parameterShortName: '-v',
      description: 'Display the logs during the build, rather than just displaying the build status summary'
    });
  }

  protected onExecute(): void {
    this._rushConfiguration = RushConfiguration.loadFromDefaultLocation();

    if (!fsx.existsSync(this._rushConfiguration.rushLinkJsonFilename)) {
      throw new Error('File not found: ' + this._rushConfiguration.rushLinkJsonFilename
        + os.EOL + 'Did you run "rush link"?');
    }
    this._rushLinkJson = JsonFile.loadJsonFile(this._rushConfiguration.rushLinkJsonFilename);

    console.log(`Starting "rush ${this.options.actionVerb}"` + os.EOL);
    const stopwatch: Stopwatch = Stopwatch.start();

    const isQuietmode: boolean = !(this._verboseParameter.value)

    const taskRunner: TaskRunner = new TaskRunner(isQuietmode, this._parallelismParameter.value);

    const toFlags: string[] = this._toFlag.value;
    const fromFlags: string[] = this._fromFlag.value;

    if (toFlags) {
      this._registerToFlags(taskRunner, toFlags);
    }
    if (fromFlags) {
      this._registerFromFlags(taskRunner, fromFlags);
    }
    if (!toFlags && !fromFlags) {
      this._registerAll(taskRunner);
    }

    taskRunner.execute()
      .then(
      () => {
        stopwatch.stop();
        console.log(colors.green(`rush ${this.options.actionVerb} (${stopwatch.toString()})`));
      },
      () => {
        stopwatch.stop();
        console.log(colors.red(`rush ${this.options.actionVerb} - Errors! (${stopwatch.toString()})`));
        process.exit(1);
      });
  }

  private _registerToFlags(taskRunner: TaskRunner, toFlags: string[]): void {
    for (const toFlag of toFlags) {
      const toProject: RushConfigurationProject = this._rushConfiguration.findProjectByShorthandName(toFlag);
      if (!toProject) {
        throw new Error(`The project '${toFlag}' does not exist in rush.json`);
      }

      const deps: Set<string> = this._collectAllDependencies(toProject.packageName);

      // Register any dependencies it may have
      deps.forEach(dep => this._registerTask(taskRunner, this._rushConfiguration.getProjectByName(dep)));

      // Register the dependency graph to the TaskRunner
      deps.forEach(dep => taskRunner.addDependencies(dep, this._rushLinkJson.localLinks[dep] || []));
    }
  }

  private _registerFromFlags(taskRunner: TaskRunner, fromFlags: string[]): void {
    for (const fromFlag of fromFlags) {
      const fromProject: RushConfigurationProject = this._rushConfiguration.findProjectByShorthandName(fromFlag);
      if (!fromProject) {
        throw new Error(`The project '${fromFlag}' does not exist in rush.json`);
      }

      // Only register projects which depend on the current package, as well as things that depend on them
      this._buildDependentGraph();

      // We will assume this project will be built, but act like it has no dependencies
      const dependents: Set<string> = this._collectAllDependents(fromProject.packageName);
      dependents.add(fromFlag);

      // Register all downstream dependents
      dependents.forEach(dependent => this._registerTask(taskRunner,
                                                         this._rushConfiguration.getProjectByName(dependent)));

      // Only register dependencies graph for projects which have been registered
      // e.g. package C may depend on A & B, but if we are only building A's downstream, we will ignore B
      dependents.forEach(dependent =>
        taskRunner.addDependencies(dependent,
          (this._rushLinkJson.localLinks[dependent] || []).filter(dep => dependents.has(dep))));
    }
  }

  private _registerAll(taskRunner: TaskRunner): void {
    // Register all tasks
    for (const rushProject of this._rushConfiguration.projects) {
      this._registerTask(taskRunner, rushProject);
    }

    // Add all dependencies
    for (const projectName of Object.keys(this._rushLinkJson.localLinks)) {
      taskRunner.addDependencies(projectName, this._rushLinkJson.localLinks[projectName]);
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
    const deps: Set<string> = new Set<string>(this._dependentList.get(project));
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
        this._dependentList.get(dep).add(project);
      });
    });
  }

  private _registerTask(taskRunner: TaskRunner, project: RushConfigurationProject): void {
    const errorMode: ErrorDetectionMode = this._vsoParameter.value
      ? ErrorDetectionMode.VisualStudioOnline
      : ErrorDetectionMode.LocalBuild;

    const activeRules: IErrorDetectionRule[] = [
      TestErrorDetector,
      TsErrorDetector,
      TsLintErrorDetector
    ];
    const errorDetector: ErrorDetector = new ErrorDetector(activeRules);
    const projectTask: ProjectBuildTask = new ProjectBuildTask(
      project,
      this._rushConfiguration,
      errorDetector,
      errorMode,
      this._productionParameter.value,
      this._npmParameter.value,
      this._minimalParameter.value,
      this._isIncrementalBuildAllowed);

    if (!taskRunner.hasTask(projectTask.name)) {
      taskRunner.addTask(projectTask);
    }
  }
}
