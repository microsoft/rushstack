// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'os';
import colors from 'colors/safe';

import { AlreadyReportedError, Terminal } from '@rushstack/node-core-library';
import { CommandLineFlagParameter, CommandLineStringParameter } from '@rushstack/ts-command-line';

import { Event, ProjectChangeAnalyzer } from '../../index';
import { SetupChecks } from '../../logic/SetupChecks';
import { Stopwatch, StopwatchState } from '../../utilities/Stopwatch';
import { BaseScriptAction, IBaseScriptActionOptions } from './BaseScriptAction';
import {
  ITaskExecutionManagerOptions,
  TaskExecutionManager
} from '../../logic/taskExecution/TaskExecutionManager';
import { RushConstants } from '../../logic/RushConstants';
import { EnvironmentVariableNames } from '../../api/EnvironmentConfiguration';
import { LastLinkFlag, LastLinkFlagFactory } from '../../api/LastLinkFlag';
import { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { BuildCacheConfiguration } from '../../api/BuildCacheConfiguration';
import { SelectionParameterSet } from '../SelectionParameterSet';
import type { CommandLineConfiguration, IPhase, IPhasedCommand } from '../../api/CommandLineConfiguration';
import type { IProjectTaskSelectorOptions } from '../../logic/ProjectTaskSelector';
import { ProjectTaskSelector } from '../../logic/ProjectTaskSelector';
import { Selection } from '../../logic/Selection';
import { IProjectTaskFactoryOptions, ProjectTaskFactory } from '../../logic/taskExecution/ProjectTaskFactory';

/**
 * Constructor parameters for BulkScriptAction.
 */
export interface IPhasedScriptActionOptions extends IBaseScriptActionOptions<IPhasedCommand> {
  enableParallelism: boolean;
  incremental: boolean;
  watchForChanges: boolean;
  disableBuildCache: boolean;

  actionPhases: Set<IPhase>;
  phases: Map<string, IPhase>;
}

interface IExecuteInternalOptions {
  taskSelector: ProjectTaskSelector;
  taskExecutionManagerOptions: ITaskExecutionManagerOptions;
  projectSelection: Set<RushConfigurationProject>;
  taskFactoryOptions: IProjectTaskFactoryOptions;
  stopwatch: Stopwatch;
  ignoreHooks?: boolean;
  terminal: Terminal;
}

/**
 * This class implements bulk commands which are run individually for each project in the repo,
 * possibly in parallel. The task selector is abstract and is implemented for phased or non-phased
 * commands.
 *
 * @remarks
 * Bulk commands can be defined via common/config/command-line.json.  Rush's predefined "build"
 * and "rebuild" commands are also modeled as bulk commands, because they essentially just
 * execute scripts from package.json in the same as any custom command.
 */
export class PhasedScriptAction extends BaseScriptAction<IPhasedCommand> {
  private readonly _enableParallelism: boolean;
  private readonly _isIncrementalBuildAllowed: boolean;
  private readonly _watchForChanges: boolean;
  private readonly _disableBuildCache: boolean;
  private readonly _repoCommandLineConfiguration: CommandLineConfiguration;
  private readonly _actionPhases: ReadonlySet<IPhase>;
  private readonly _phases: Map<string, IPhase>;

  private _changedProjectsOnly!: CommandLineFlagParameter;
  private _selectionParameters!: SelectionParameterSet;
  private _verboseParameter!: CommandLineFlagParameter;
  private _parallelismParameter: CommandLineStringParameter | undefined;
  private _ignoreHooksParameter!: CommandLineFlagParameter;

  public constructor(options: IPhasedScriptActionOptions) {
    super(options);
    this._enableParallelism = options.enableParallelism;
    this._isIncrementalBuildAllowed = options.incremental;
    this._watchForChanges = options.watchForChanges;
    this._disableBuildCache = options.disableBuildCache;
    this._repoCommandLineConfiguration = options.commandLineConfiguration;
    this._actionPhases = options.actionPhases;
    this._phases = options.phases;
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

    const changedProjectsOnly: boolean = this._isIncrementalBuildAllowed && this._changedProjectsOnly.value;

    const terminal: Terminal = new Terminal(this.rushSession.terminalProvider);
    let buildCacheConfiguration: BuildCacheConfiguration | undefined;
    if (!this._disableBuildCache) {
      buildCacheConfiguration = await BuildCacheConfiguration.tryLoadAsync(
        terminal,
        this.rushConfiguration,
        this.rushSession
      );
    }

    const projectSelection: Set<RushConfigurationProject> =
      await this._selectionParameters.getSelectedProjectsAsync(terminal);

    if (!projectSelection.size) {
      terminal.writeLine(colors.yellow(`The command line selection parameters did not match any projects.`));
      return;
    }

    const phasesToRun: Set<IPhase> = new Set(this._actionPhases);
    const taskFactoryOptions: IProjectTaskFactoryOptions = {
      rushConfiguration: this.rushConfiguration,
      buildCacheConfiguration,
      isIncrementalBuildAllowed: this._isIncrementalBuildAllowed,
      customParameters: this.customParameters,
      projectChangeAnalyzer: new ProjectChangeAnalyzer(this.rushConfiguration)
    };

    const taskSelectorOptions: IProjectTaskSelectorOptions = {
      projects: this.rushConfiguration.projects,
      phasesToRun: phasesToRun,
      phases: this._phases
    };

    const taskExecutionManagerOptions: ITaskExecutionManagerOptions = {
      quietMode: isQuietMode,
      debugMode: this.parser.isDebug,
      parallelism: parallelism,
      changedProjectsOnly: changedProjectsOnly,
      repoCommandLineConfiguration: this._repoCommandLineConfiguration
    };

    const taskSelector: ProjectTaskSelector = new ProjectTaskSelector(taskSelectorOptions);

    const executeOptions: IExecuteInternalOptions = {
      taskSelector,
      taskExecutionManagerOptions: taskExecutionManagerOptions,
      projectSelection,
      taskFactoryOptions,
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
      taskSelector,
      projectSelection: projectsToWatch,
      taskFactoryOptions,
      taskExecutionManagerOptions,
      stopwatch,
      terminal
    } = options;

    // Use async import so that we don't pay the cost for sync builds
    const { ProjectWatcher } = await import('../../logic/ProjectWatcher');

    const projectWatcher: typeof ProjectWatcher.prototype = new ProjectWatcher({
      debounceMilliseconds: 1000,
      rushConfiguration: this.rushConfiguration,
      projectsToWatch,
      terminal
    });

    const onWatchingFiles = (): void => {
      // Report so that the developer can always see that it is in watch mode as the latest console line.
      terminal.writeLine(
        `Watching for changes to ${projectsToWatch.size} ${
          projectsToWatch.size === 1 ? 'project' : 'projects'
        }. Press Ctrl+C to exit.`
      );
    };

    // Loop until Ctrl+C
    // eslint-disable-next-line no-constant-condition
    while (true) {
      // On the initial invocation, this promise will return immediately with the full set of projects
      const { changedProjects, state } = await projectWatcher.waitForChange(onWatchingFiles);

      if (stopwatch.state === StopwatchState.Stopped) {
        // Clear and reset the stopwatch so that we only report time from a single execution at a time
        stopwatch.reset();
        stopwatch.start();
      }

      terminal.writeLine(
        `Detected changes in ${changedProjects.size} project${changedProjects.size === 1 ? '' : 's'}:`
      );
      const names: string[] = [...changedProjects].map((x) => x.packageName).sort();
      for (const name of names) {
        terminal.writeLine(`    ${colors.cyan(name)}`);
      }

      // Account for consumer relationships
      const projectSelection: Set<RushConfigurationProject> = Selection.intersection(
        Selection.expandAllConsumers(changedProjects),
        projectsToWatch
      );

      const executeOptions: IExecuteInternalOptions = {
        taskSelector,
        projectSelection,
        taskFactoryOptions: {
          ...taskFactoryOptions,
          projectChangeAnalyzer: state
        },
        taskExecutionManagerOptions,
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

    this._selectionParameters = new SelectionParameterSet(this.rushConfiguration, this, {
      // Include lockfile processing since this expands the selection, and we need to select
      // at least the same projects selected with the same query to "rush build"
      includeExternalDependencies: true,
      // Enable filtering to reduce evaluation cost
      enableFiltering: true
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
    const { taskSelector, projectSelection, taskFactoryOptions } = options;

    const taskFactory: ProjectTaskFactory = new ProjectTaskFactory(taskFactoryOptions);

    const taskExecutionManager: TaskExecutionManager = new TaskExecutionManager(
      taskSelector.createTasks({
        projectSelection,
        taskFactory
      }),
      options.taskExecutionManagerOptions
    );

    const { ignoreHooks, stopwatch } = options;

    try {
      await taskExecutionManager.executeAsync();

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
        if (error && (error as Error).message) {
          if (this.parser.isDebug) {
            console.log('Error: ' + (error as Error).stack);
          } else {
            console.log('Error: ' + (error as Error).message);
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
    const extraData: Record<string, string> = {
      ...this._selectionParameters.getTelemetry(),
      ...this.getParameterStringMap()
    };

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
