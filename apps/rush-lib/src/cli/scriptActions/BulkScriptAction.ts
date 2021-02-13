// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'os';
import colors from 'colors';

import {
  AlreadyReportedError,
  ConsoleTerminalProvider,
  PackageName,
  Terminal
} from '@rushstack/node-core-library';
import {
  CommandLineFlagParameter,
  CommandLineStringParameter,
  CommandLineStringListParameter,
  CommandLineParameterKind
} from '@rushstack/ts-command-line';

import { Event } from '../../index';
import { SetupChecks } from '../../logic/SetupChecks';
import { ITaskSelectorConstructor, TaskSelector } from '../../logic/TaskSelector';
import { Stopwatch, StopwatchState } from '../../utilities/Stopwatch';
import { BaseScriptAction, IBaseScriptActionOptions } from './BaseScriptAction';
import { ITaskRunnerOptions, TaskRunner } from '../../logic/taskRunner/TaskRunner';
import { Utilities } from '../../utilities/Utilities';
import { RushConstants } from '../../logic/RushConstants';
import { EnvironmentVariableNames } from '../../api/EnvironmentConfiguration';
import { LastLinkFlag, LastLinkFlagFactory } from '../../api/LastLinkFlag';
import { IRushConfigurationProjectJson, RushConfigurationProject } from '../../api/RushConfigurationProject';
import { BuildCacheConfiguration } from '../../api/BuildCacheConfiguration';
import { Selection } from '../../logic/Selection';

/**
 * Constructor parameters for BulkScriptAction.
 */
export interface IBulkScriptActionOptions extends IBaseScriptActionOptions {
  enableParallelism: boolean;
  ignoreMissingScript: boolean;
  ignoreDependencyOrder: boolean;
  incremental: boolean;
  allowWarningsInSuccessfulBuild: boolean;
  watchForChanges: boolean;

  /**
   * Optional command to run. Otherwise, use the `actionName` as the command to run.
   */
  commandToRun?: string;
}

interface IExecuteInternalOptions {
  taskSelectorOptions: ITaskSelectorConstructor;
  taskRunnerOptions: ITaskRunnerOptions;
  stopwatch: Stopwatch;
  ignoreHooks?: boolean;
  terminal: Terminal;
}

/**
 * This class implements bulk commands which are run individually for each project in the repo,
 * possibly in parallel.  The action executes a script found in the project's package.json file.
 *
 * @remarks
 * Bulk commands can be defined via common/config/command-line.json.  Rush's predefined "build"
 * and "rebuild" commands are also modeled as bulk commands, because they essentially just
 * execute scripts from package.json in the same as any custom command.
 */
export class BulkScriptAction extends BaseScriptAction {
  private _enableParallelism: boolean;
  private _ignoreMissingScript: boolean;
  private _isIncrementalBuildAllowed: boolean;
  private _commandToRun: string;
  private _watchForChanges: boolean;

  private _changedProjectsOnly!: CommandLineFlagParameter;
  private _fromProject!: CommandLineStringListParameter;
  private _onlyProject!: CommandLineStringListParameter;
  private _toProject!: CommandLineStringListParameter;
  private _toExceptProject!: CommandLineStringListParameter;
  private _impactedByProject!: CommandLineStringListParameter;
  private _impactedByExceptProject!: CommandLineStringListParameter;
  private _fromVersionPolicy!: CommandLineStringListParameter;
  private _toVersionPolicy!: CommandLineStringListParameter;
  private _verboseParameter!: CommandLineFlagParameter;
  private _parallelismParameter: CommandLineStringParameter | undefined;
  private _ignoreHooksParameter!: CommandLineFlagParameter;
  private _ignoreDependencyOrder: boolean;
  private _allowWarningsInSuccessfulBuild: boolean;

  public constructor(options: IBulkScriptActionOptions) {
    super(options);
    this._enableParallelism = options.enableParallelism;
    this._ignoreMissingScript = options.ignoreMissingScript;
    this._isIncrementalBuildAllowed = options.incremental;
    this._commandToRun = options.commandToRun || options.actionName;
    this._ignoreDependencyOrder = options.ignoreDependencyOrder;
    this._allowWarningsInSuccessfulBuild = options.allowWarningsInSuccessfulBuild;
    this._watchForChanges = options.watchForChanges;
  }

  public async runAsync(): Promise<void> {
    // TODO: Replace with last-install.flag when "rush link" and "rush unlink" are deprecated
    const lastLinkFlag: LastLinkFlag = LastLinkFlagFactory.getCommonTempFlag(this.rushConfiguration);
    if (!lastLinkFlag.isValid()) {
      const useWorkspaces: boolean =
        this.rushConfiguration.pnpmOptions && this.rushConfiguration.pnpmOptions.useWorkspaces;
      if (useWorkspaces) {
        throw new Error(`Link flag invalid.${os.EOL}Did you run "rush install" or "rush update"?`);
      } else {
        throw new Error(`Link flag invalid.${os.EOL}Did you run "rush link"?`);
      }
    }

    this._doBeforeTask();

    const stopwatch: Stopwatch = Stopwatch.start();

    const isQuietMode: boolean = !this._verboseParameter.value;

    // if this is parallelizable, then use the value from the flag (undefined or a number),
    // if parallelism is not enabled, then restrict to 1 core
    const parallelism: string | undefined = this._enableParallelism ? this._parallelismParameter!.value : '1';

    // Collect all custom parameter values
    const customParameterValues: string[] = [];
    for (const customParameter of this.customParameters) {
      customParameter.appendToArgList(customParameterValues);
    }

    const changedProjectsOnly: boolean = this._isIncrementalBuildAllowed && this._changedProjectsOnly.value;

    const terminal: Terminal = new Terminal(new ConsoleTerminalProvider());
    const buildCacheConfiguration:
      | BuildCacheConfiguration
      | undefined = await BuildCacheConfiguration.loadFromDefaultPathAsync(terminal, this.rushConfiguration);

    // Include exactly these projects (--only)
    const onlyProjects: Iterable<RushConfigurationProject> = this.evaluateProjectParameter(this._onlyProject);

    // Include all projects that depend on these projects, and all dependencies thereof
    const fromProjects: Set<RushConfigurationProject> = Selection.union(
      // --from
      this.evaluateProjectParameter(this._fromProject),
      // --from-version-policy
      this.evaluateVersionPolicyProjects(this._fromVersionPolicy)
    );

    // Include dependencies of these projects
    const toProjects: Set<RushConfigurationProject> = Selection.union(
      // --to
      this.evaluateProjectParameter(this._toProject),
      // --to-version-policy
      this.evaluateVersionPolicyProjects(this._toVersionPolicy),
      // --to-except
      Selection.directDependenciesOf(this.evaluateProjectParameter(this._toExceptProject)),
      // --from / --from-version-policy
      Selection.expandAllConsumers(fromProjects)
    );

    // These projects will not have their dependencies included
    const impactedByProjects: Set<RushConfigurationProject> = Selection.union(
      // --impacted-by
      this.evaluateProjectParameter(this._impactedByProject),
      // --impacted-by-except
      Selection.directConsumersOf(this.evaluateProjectParameter(this._impactedByExceptProject))
    );

    const selection: Set<RushConfigurationProject> = Selection.union(
      onlyProjects,
      Selection.expandAllDependencies(toProjects),
      // Only dependents of these projects, not dependencies
      Selection.expandAllConsumers(impactedByProjects)
    );

    // If no projects selected, select everything.
    if (selection.size === 0) {
      for (const project of this.rushConfiguration.projects) {
        selection.add(project);
      }
    }

    const taskSelectorOptions: ITaskSelectorConstructor = {
      rushConfiguration: this.rushConfiguration,
      buildCacheConfiguration,
      selection,
      commandToRun: this._commandToRun,
      customParameterValues,
      isQuietMode: isQuietMode,
      isIncrementalBuildAllowed: this._isIncrementalBuildAllowed,
      ignoreMissingScript: this._ignoreMissingScript,
      ignoreDependencyOrder: this._ignoreDependencyOrder,
      packageDepsFilename: Utilities.getPackageDepsFilenameForCommand(this._commandToRun)
    };

    const taskRunnerOptions: ITaskRunnerOptions = {
      quietMode: isQuietMode,
      parallelism: parallelism,
      changedProjectsOnly: changedProjectsOnly,
      allowWarningsInSuccessfulBuild: this._allowWarningsInSuccessfulBuild
    };

    const executeOptions: IExecuteInternalOptions = {
      taskSelectorOptions,
      taskRunnerOptions,
      stopwatch,
      terminal
    };

    if (this._watchForChanges) {
      await this._runWatch(executeOptions);
    } else {
      await this._runOnce(executeOptions);
    }
  }

  /**
   * Runs the command in watch mode. Fundamentally is a simple loop:
   * 1) Wait for a change to one or more projects in the selection (skipped initially)
   * 2) Invoke the command on the changed projects, and, if applicable, impacted projects
   *    Uses the same algorithm as --impacted-by
   * 3) Goto (1)
   */
  private async _runWatch(options: IExecuteInternalOptions): Promise<void> {
    const {
      taskSelectorOptions: {
        buildCacheConfiguration: initialBuildCacheConfiguration,
        selection: projectsToWatch
      },
      stopwatch,
      terminal
    } = options;

    // Use async import so that we don't pay the cost for sync builds
    const { ProjectWatcher } = await import('../../logic/ProjectWatcher');

    const projectWatcher: typeof ProjectWatcher.prototype = new ProjectWatcher({
      debounceMilliseconds: 1000,
      rushConfiguration: this.rushConfiguration,
      projectsToWatch
    });

    let isInitialPass: boolean = true;

    // Loop until Ctrl+C
    // eslint-disable-next-line no-constant-condition
    while (true) {
      // Report so that the developer can always see that it is in watch mode as the latest console line.
      terminal.writeLine(
        `Watching for changes to ${projectsToWatch.size} ${
          projectsToWatch.size === 1 ? 'project' : 'projects'
        }. Press Ctrl+C to exit.`
      );

      // On the initial invocation, this promise will return immediately with the full set of projects
      const { changedProjects, state } = await projectWatcher.waitForChange();

      let selection: ReadonlySet<RushConfigurationProject> = changedProjects;

      if (stopwatch.state === StopwatchState.Stopped) {
        // Clear and reset the stopwatch so that we only report time from a single execution at a time
        stopwatch.reset();
        stopwatch.start();
      }

      terminal.writeLine(`Detected changes in ${selection.size} project${selection.size === 1 ? '' : 's'}:`);
      const names: string[] = [...selection].map((x) => x.packageName).sort();
      for (const name of names) {
        terminal.writeLine(`    ${colors.cyan(name)}`);
      }

      // If the command ignores dependency order, that means that only the changed projects should be affected
      // That said, running watch for commands that ignore dependency order may have unexpected results
      if (!this._ignoreDependencyOrder) {
        selection = Selection.intersection(Selection.expandAllConsumers(selection), projectsToWatch);
      }

      const executeOptions: IExecuteInternalOptions = {
        taskSelectorOptions: {
          ...options.taskSelectorOptions,
          // Current implementation of the build cache deletes output folders before repopulating them;
          // this tends to break `webpack --watch`, etc.
          // Also, skipping writes to the local cache reduces CPU overhead and saves disk usage.
          buildCacheConfiguration: isInitialPass ? initialBuildCacheConfiguration : undefined,
          // Revise down the set of projects to execute the command on
          selection,
          // Pass the PackageChangeAnalyzer from the state differ to save a bit of overhead
          packageChangeAnalyzer: state
        },
        taskRunnerOptions: options.taskRunnerOptions,
        stopwatch,
        // For now, don't run pre-build or post-build in watch mode
        ignoreHooks: true,
        terminal
      };

      try {
        // Delegate the the underlying command, for only the projects that need reprocessing
        await this._runOnce(executeOptions);
      } catch (err) {
        // In watch mode, we want to rebuild even if the original build failed.
        if (!(err instanceof AlreadyReportedError)) {
          throw err;
        }
      }

      isInitialPass = false;
    }
  }

  protected onDefineParameters(): void {
    if (this._enableParallelism) {
      this._parallelismParameter = this.defineStringParameter({
        parameterLongName: '--parallelism',
        parameterShortName: '-p',
        argumentName: 'COUNT',
        environmentVariable: EnvironmentVariableNames.RUSH_PARALLELISM,
        description:
          'Specifies the maximum number of concurrent processes to launch during a build.' +
          ' The COUNT should be a positive integer or else the word "max" to specify a count that is equal to' +
          ' the number of CPU cores. If this parameter is omitted, then the default value depends on the' +
          ' operating system and number of CPU cores.'
      });
    }

    this._toProject = this.defineStringListParameter({
      parameterLongName: '--to',
      parameterShortName: '-t',
      argumentName: 'PROJECT',
      description:
        'Normally all projects in the monorepo will be processed;' +
        ' adding this parameter will instead select a subset of projects.' +
        ' Each "--to" parameter expands this selection to include PROJECT and all its dependencies.' +
        ' "." can be used as shorthand for the project in the current working directory.' +
        ' For details, refer to the website article "Selecting subsets of projects".',
      completions: this._getProjectNames.bind(this)
    });
    this._toExceptProject = this.defineStringListParameter({
      parameterLongName: '--to-except',
      parameterShortName: '-T',
      argumentName: 'PROJECT',
      description:
        'Normally all projects in the monorepo will be processed;' +
        ' adding this parameter will instead select a subset of projects.' +
        ' Each "--to-except" parameter expands this selection to include all dependencies of PROJECT,' +
        ' but not PROJECT itself.' +
        ' "." can be used as shorthand for the project in the current working directory.' +
        ' For details, refer to the website article "Selecting subsets of projects".',
      completions: this._getProjectNames.bind(this)
    });

    this._fromProject = this.defineStringListParameter({
      parameterLongName: '--from',
      parameterShortName: '-f',
      argumentName: 'PROJECT',
      description:
        'Normally all projects in the monorepo will be processed;' +
        ' adding this parameter will instead select a subset of projects.' +
        ' Each "--from" parameter expands this selection to include PROJECT and all projects that depend on it,' +
        ' plus all dependencies of this set.' +
        ' "." can be used as shorthand for the project in the current working directory.' +
        ' For details, refer to the website article "Selecting subsets of projects".',
      completions: this._getProjectNames.bind(this)
    });
    this._onlyProject = this.defineStringListParameter({
      parameterLongName: '--only',
      parameterShortName: '-o',
      argumentName: 'PROJECT',
      description:
        'Normally all projects in the monorepo will be processed;' +
        ' adding this parameter will instead select a subset of projects.' +
        ' Each "--only" parameter expands this selection to include PROJECT; its dependencies are not added.' +
        ' "." can be used as shorthand for the project in the current working directory.' +
        ' Note that this parameter is "unsafe" as it may produce a selection that excludes some dependencies.' +
        ' For details, refer to the website article "Selecting subsets of projects".',
      completions: this._getProjectNames.bind(this)
    });

    this._impactedByProject = this.defineStringListParameter({
      parameterLongName: '--impacted-by',
      parameterShortName: '-i',
      argumentName: 'PROJECT',
      description:
        'Normally all projects in the monorepo will be processed;' +
        ' adding this parameter will instead select a subset of projects.' +
        ' Each "--impacted-by" parameter expands this selection to include PROJECT and any projects that' +
        ' depend on PROJECT (and thus might be broken by changes to PROJECT).' +
        ' "." can be used as shorthand for the project in the current working directory.' +
        ' Note that this parameter is "unsafe" as it may produce a selection that excludes some dependencies.' +
        ' For details, refer to the website article "Selecting subsets of projects".',
      completions: this._getProjectNames.bind(this)
    });

    this._impactedByExceptProject = this.defineStringListParameter({
      parameterLongName: '--impacted-by-except',
      parameterShortName: '-I',
      argumentName: 'PROJECT',
      description:
        'Normally all projects in the monorepo will be processed;' +
        ' adding this parameter will instead select a subset of projects.' +
        ' Each "--impacted-by-except" parameter works the same as "--impacted-by" except that PROJECT itself' +
        ' is not added to the selection.' +
        ' "." can be used as shorthand for the project in the current working directory.' +
        ' Note that this parameter is "unsafe" as it may produce a selection that excludes some dependencies.' +
        ' For details, refer to the website article "Selecting subsets of projects".',
      completions: this._getProjectNames.bind(this)
    });

    this._toVersionPolicy = this.defineStringListParameter({
      parameterLongName: '--to-version-policy',
      argumentName: 'VERSION_POLICY_NAME',
      description:
        'Normally all projects in the monorepo will be processed;' +
        ' adding this parameter will instead select a subset of projects.' +
        ' The "--to-version-policy" parameter is equivalent to specifying "--to" for each of the projects' +
        ' belonging to VERSION_POLICY_NAME.' +
        ' For details, refer to the website article "Selecting subsets of projects".'
    });
    this._fromVersionPolicy = this.defineStringListParameter({
      parameterLongName: '--from-version-policy',
      argumentName: 'VERSION_POLICY_NAME',
      description:
        'Normally all projects in the monorepo will be processed;' +
        ' adding this parameter will instead select a subset of projects.' +
        ' The "--from-version-policy" parameter is equivalent to specifying "--from" for each of the projects' +
        ' belonging to VERSION_POLICY_NAME.' +
        ' For details, refer to the website article "Selecting subsets of projects".'
    });

    this._verboseParameter = this.defineFlagParameter({
      parameterLongName: '--verbose',
      parameterShortName: '-v',
      description: 'Display the logs during the build, rather than just displaying the build status summary'
    });
    if (this._isIncrementalBuildAllowed) {
      this._changedProjectsOnly = this.defineFlagParameter({
        parameterLongName: '--changed-projects-only',
        parameterShortName: '-c',
        description:
          'Normally the incremental build logic will rebuild changed projects as well as' +
          ' any projects that directly or indirectly depend on a changed project. Specify "--changed-projects-only"' +
          ' to ignore dependent projects, only rebuilding those projects whose files were changed.' +
          ' Note that this parameter is "unsafe"; it is up to the developer to ensure that the ignored projects' +
          ' are okay to ignore.'
      });
    }
    this._ignoreHooksParameter = this.defineFlagParameter({
      parameterLongName: '--ignore-hooks',
      description: `Skips execution of the "eventHooks" scripts defined in rush.json. Make sure you know what you are skipping.`
    });

    this.defineScriptParameters();
  }

  /**
   * Runs a single invocation of the command
   */
  private async _runOnce(options: IExecuteInternalOptions): Promise<void> {
    const taskSelector: TaskSelector = new TaskSelector(options.taskSelectorOptions);

    // Register all tasks with the task collection

    const taskRunner: TaskRunner = new TaskRunner(
      taskSelector.registerTasks().getOrderedTasks(),
      options.taskRunnerOptions
    );

    const { ignoreHooks, stopwatch } = options;

    try {
      await taskRunner.executeAsync();

      stopwatch.stop();
      console.log(colors.green(`rush ${this.actionName} (${stopwatch.toString()})`));

      if (!ignoreHooks) {
        this._doAfterTask(stopwatch, true);
      }
    } catch (error) {
      stopwatch.stop();

      if (error instanceof AlreadyReportedError) {
        console.log(`rush ${this.actionName} (${stopwatch.toString()})`);
      } else {
        if (error && error.message) {
          if (this.parser.isDebug) {
            console.log('Error: ' + error.stack);
          } else {
            console.log('Error: ' + error.message);
          }
        }

        console.log(colors.red(`rush ${this.actionName} - Errors! (${stopwatch.toString()})`));
      }

      if (!ignoreHooks) {
        this._doAfterTask(stopwatch, false);
      }
      throw new AlreadyReportedError();
    }
  }

  private async _getProjectNames(): Promise<string[]> {
    const unscopedNamesMap: Map<string, number> = new Map<string, number>();

    const scopedNames: string[] = [];

    const projectJsons: IRushConfigurationProjectJson[] = [
      ...this.rushConfiguration.rushConfigurationJson.projects
    ];

    for (const projectJson of projectJsons) {
      scopedNames.push(projectJson.packageName);
      const unscopedName: string = PackageName.getUnscopedName(projectJson.packageName);
      let count: number = 0;
      if (unscopedNamesMap.has(unscopedName)) {
        count = unscopedNamesMap.get(unscopedName)!;
      }
      unscopedNamesMap.set(unscopedName, count + 1);
    }

    const unscopedNames: string[] = [];

    for (const unscopedName of unscopedNamesMap.keys()) {
      const unscopedNameCount: number = unscopedNamesMap.get(unscopedName)!;
      // don't suggest ambiguous unscoped names
      if (unscopedNameCount === 1 && !scopedNames.includes(unscopedName)) {
        unscopedNames.push(unscopedName);
      }
    }

    return unscopedNames.sort().concat(scopedNames.sort());
  }

  private _doBeforeTask(): void {
    if (
      this.actionName !== RushConstants.buildCommandName &&
      this.actionName !== RushConstants.rebuildCommandName
    ) {
      // Only collects information for built-in tasks like build or rebuild.
      return;
    }

    SetupChecks.validate(this.rushConfiguration);

    this.eventHooksManager.handle(Event.preRushBuild, this.parser.isDebug, this._ignoreHooksParameter.value);
  }

  private _doAfterTask(stopwatch: Stopwatch, success: boolean): void {
    if (
      this.actionName !== RushConstants.buildCommandName &&
      this.actionName !== RushConstants.rebuildCommandName
    ) {
      // Only collects information for built-in tasks like build or rebuild.
      return;
    }
    this._collectTelemetry(stopwatch, success);
    this.parser.flushTelemetry();
    this.eventHooksManager.handle(Event.postRushBuild, this.parser.isDebug, this._ignoreHooksParameter.value);
  }

  private _collectTelemetry(stopwatch: Stopwatch, success: boolean): void {
    const extraData: { [key: string]: string } = {
      command_to: (this._toProject.values.length > 0).toString(),
      command_from: (this._fromProject.values.length > 0).toString()
    };

    for (const customParameter of this.customParameters) {
      switch (customParameter.kind) {
        case CommandLineParameterKind.Flag:
        case CommandLineParameterKind.Choice:
        case CommandLineParameterKind.String:
        case CommandLineParameterKind.Integer:
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          extraData[customParameter.longName] = JSON.stringify((customParameter as any).value);
          break;
        default:
          extraData[customParameter.longName] = '?';
      }
    }

    if (this.parser.telemetry) {
      this.parser.telemetry.log({
        name: this.actionName,
        duration: stopwatch.duration,
        result: success ? 'Succeeded' : 'Failed',
        extraData
      });
    }
  }
}
