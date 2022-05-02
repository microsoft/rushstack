// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'os';
import colors from 'colors/safe';
import type { AsyncSeriesHook } from 'tapable';

import { AlreadyReportedError, InternalError, Terminal } from '@rushstack/node-core-library';
import {
  CommandLineFlagParameter,
  CommandLineParameter,
  CommandLineStringParameter
} from '@rushstack/ts-command-line';

import type { IPhasedCommand } from '../../pluginFramework/RushLifeCycle';
import { PhasedCommandHooks, ICreateOperationsContext } from '../../pluginFramework/PhasedCommandHooks';
import { SetupChecks } from '../../logic/SetupChecks';
import { Stopwatch, StopwatchState } from '../../utilities/Stopwatch';
import { BaseScriptAction, IBaseScriptActionOptions } from './BaseScriptAction';
import {
  IOperationExecutionManagerOptions,
  OperationExecutionManager
} from '../../logic/operations/OperationExecutionManager';
import { RushConstants } from '../../logic/RushConstants';
import { EnvironmentVariableNames } from '../../api/EnvironmentConfiguration';
import { LastLinkFlag, LastLinkFlagFactory } from '../../api/LastLinkFlag';
import { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { BuildCacheConfiguration } from '../../api/BuildCacheConfiguration';
import { SelectionParameterSet } from '../SelectionParameterSet';
import type { IPhase, IPhasedCommandConfig } from '../../api/CommandLineConfiguration';
import { Operation } from '../../logic/operations/Operation';
import { PhasedOperationPlugin } from '../../logic/operations/PhasedOperationPlugin';
import { ShellOperationRunnerPlugin } from '../../logic/operations/ShellOperationRunnerPlugin';
import { Selection } from '../../logic/Selection';
import { Event } from '../../api/EventHooks';
import { ProjectChangeAnalyzer } from '../../logic/ProjectChangeAnalyzer';
import type { BaseInstallManager } from '../../logic/base/BaseInstallManager';

/**
 * Constructor parameters for BulkScriptAction.
 */
export interface IPhasedScriptActionOptions extends IBaseScriptActionOptions<IPhasedCommandConfig> {
  enableParallelism: boolean;
  incremental: boolean;
  disableBuildCache: boolean;

  initialPhases: Set<IPhase>;
  watchPhases: Set<IPhase>;
  phases: Map<string, IPhase>;

  alwaysWatch: boolean;
  alwaysInstall: boolean | undefined;
}

interface IRunPhasesOptions {
  initialCreateOperationsContext: ICreateOperationsContext;
  executionManagerOptions: IOperationExecutionManagerOptions;
  stopwatch: Stopwatch;
  terminal: Terminal;
}

interface IExecutionOperationsOptions {
  executionManagerOptions: IOperationExecutionManagerOptions;
  ignoreHooks: boolean;
  operations: Set<Operation>;
  stopwatch: Stopwatch;
  isWatch: boolean;
  terminal: Terminal;
}

/**
 * This class implements phased commands which are run individually for each project in the repo,
 * possibly in parallel, and which may define multiple phases.
 *
 * @remarks
 * Phased commands can be defined via common/config/command-line.json.  Rush's predefined "build"
 * and "rebuild" commands are also modeled as phased commands with a single phase that invokes the npm
 * "build" script for each project.
 */
export class PhasedScriptAction extends BaseScriptAction<IPhasedCommandConfig> {
  public readonly hooks: PhasedCommandHooks;

  private readonly _enableParallelism: boolean;
  private readonly _isIncrementalBuildAllowed: boolean;
  private readonly _disableBuildCache: boolean;
  private readonly _initialPhases: ReadonlySet<IPhase>;
  private readonly _watchPhases: ReadonlySet<IPhase>;
  private readonly _alwaysWatch: boolean;
  private readonly _alwaysInstall: boolean | undefined;
  private readonly _knownPhases: ReadonlyMap<string, IPhase>;

  private _changedProjectsOnly!: CommandLineFlagParameter;
  private _selectionParameters!: SelectionParameterSet;
  private _verboseParameter!: CommandLineFlagParameter;
  private _parallelismParameter: CommandLineStringParameter | undefined;
  private _ignoreHooksParameter!: CommandLineFlagParameter;
  private _watchParameter: CommandLineFlagParameter | undefined;
  private _timelineParameter: CommandLineFlagParameter | undefined;
  private _installParameter: CommandLineFlagParameter | undefined;

  public constructor(options: IPhasedScriptActionOptions) {
    super(options);
    this._enableParallelism = options.enableParallelism;
    this._isIncrementalBuildAllowed = options.incremental;
    this._disableBuildCache = options.disableBuildCache;
    this._initialPhases = options.initialPhases;
    this._watchPhases = options.watchPhases;
    this._alwaysWatch = options.alwaysWatch;
    this._alwaysInstall = options.alwaysInstall;
    this._knownPhases = options.phases;

    this.hooks = new PhasedCommandHooks();

    // Generates the default operation graph
    new PhasedOperationPlugin().apply(this.hooks);
    // Applies the Shell Operation Runner to selected operations
    new ShellOperationRunnerPlugin().apply(this.hooks);
  }

  public async runAsync(): Promise<void> {
    if (this._alwaysInstall || this._installParameter?.value) {
      const [{ VersionMismatchFinder }, { SetupChecks }, { PurgeManager }, { InstallManagerFactory }] =
        await Promise.all([
          import('../../logic/versionMismatch/VersionMismatchFinder'),
          import('../../logic/SetupChecks'),
          import('../../logic/PurgeManager'),
          import('../../logic/InstallManagerFactory')
        ] as const);
      VersionMismatchFinder.ensureConsistentVersions(this.rushConfiguration);
      SetupChecks.validate(this.rushConfiguration);
      const purgeManager: typeof PurgeManager.prototype = new PurgeManager(
        this.rushConfiguration,
        this.rushGlobalFolder
      );
      const installManager: BaseInstallManager = InstallManagerFactory.getInstallManager(
        this.rushConfiguration,
        this.rushGlobalFolder,
        purgeManager,
        {
          debug: this.parser.isDebug,
          allowShrinkwrapUpdates: false,
          checkOnly: false,
          bypassPolicy: false,
          noLink: false,
          fullUpgrade: false,
          recheckShrinkwrap: false,
          collectLogFile: true,
          pnpmFilterArguments: [],
          maxInstallAttempts: 1,
          networkConcurrency: undefined
        }
      );

      try {
        await installManager.doInstallAsync();
      } finally {
        purgeManager.deleteAll();
      }
    }

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

    const { hooks: sessionHooks } = this.rushSession;
    if (sessionHooks.runAnyPhasedCommand.isUsed()) {
      // Avoid the cost of compiling the hook if it wasn't tapped.
      await sessionHooks.runAnyPhasedCommand.promise(this);
    }

    const hookForAction: AsyncSeriesHook<IPhasedCommand> | undefined = sessionHooks.runPhasedCommand.get(
      this.actionName
    );
    if (hookForAction) {
      // Run the more specific hook for a command with this name after the general hook
      await hookForAction.promise(this);
    }

    const isQuietMode: boolean = !this._verboseParameter.value;

    // if this is parallelizable, then use the value from the flag (undefined or a number),
    // if parallelism is not enabled, then restrict to 1 core
    const parallelism: string | undefined = this._enableParallelism ? this._parallelismParameter!.value : '1';

    const showTimeline: boolean = this._timelineParameter ? this._timelineParameter.value : false;

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

    const isWatch: boolean = this._watchParameter?.value || this._alwaysWatch;

    const customParametersByName: Map<string, CommandLineParameter> = new Map();
    for (const [configParameter, parserParameter] of this.customParameters) {
      customParametersByName.set(configParameter.longName, parserParameter);
    }

    const initialCreateOperationsContext: ICreateOperationsContext = {
      buildCacheConfiguration,
      customParameters: customParametersByName,
      isIncrementalBuildAllowed: this._isIncrementalBuildAllowed,
      isInitial: true,
      isWatch,
      rushConfiguration: this.rushConfiguration,
      phaseSelection: new Set(this._initialPhases),
      projectChangeAnalyzer: new ProjectChangeAnalyzer(this.rushConfiguration),
      projectSelection
    };

    const executionManagerOptions: IOperationExecutionManagerOptions = {
      quietMode: isQuietMode,
      debugMode: this.parser.isDebug,
      parallelism,
      showTimeline,
      changedProjectsOnly
    };

    const internalOptions: IRunPhasesOptions = {
      initialCreateOperationsContext,
      executionManagerOptions,
      stopwatch,
      terminal
    };

    await this._runInitialPhases(internalOptions);

    if (isWatch) {
      if (buildCacheConfiguration) {
        // Cache writes are not supported during watch mode, only reads.
        buildCacheConfiguration.cacheWriteEnabled = false;
      }

      await this._runWatchPhases(internalOptions);
    }
  }

  private async _runInitialPhases(options: IRunPhasesOptions): Promise<void> {
    const { initialCreateOperationsContext, executionManagerOptions, stopwatch, terminal } = options;

    const operations: Set<Operation> = await this.hooks.createOperations.promise(
      new Set(),
      initialCreateOperationsContext
    );

    const { isWatch } = initialCreateOperationsContext;

    const initialOptions: IExecutionOperationsOptions = {
      ignoreHooks: false,
      operations,
      stopwatch,
      isWatch,
      executionManagerOptions,
      terminal
    };

    await this._executeOperations(initialOptions);
  }

  /**
   * Runs the command in watch mode. Fundamentally is a simple loop:
   * 1) Wait for a change to one or more projects in the selection
   * 2) Invoke the command on the changed projects, and, if applicable, impacted projects
   *    Uses the same algorithm as --impacted-by
   * 3) Goto (1)
   */
  private async _runWatchPhases(options: IRunPhasesOptions): Promise<void> {
    const { initialCreateOperationsContext, executionManagerOptions, stopwatch, terminal } = options;

    const phaseSelection: Set<IPhase> = new Set(this._watchPhases);

    const { projectChangeAnalyzer: initialState, projectSelection: projectsToWatch } =
      initialCreateOperationsContext;

    // Use async import so that we don't pay the cost for sync builds
    const { ProjectWatcher } = await import('../../logic/ProjectWatcher');

    const projectWatcher: typeof ProjectWatcher.prototype = new ProjectWatcher({
      debounceMilliseconds: 1000,
      rushConfiguration: this.rushConfiguration,
      projectsToWatch,
      terminal,
      initialState
    });

    const onWaitingForChanges = (): void => {
      // Allow plugins to display their own messages when waiting for changes.
      this.hooks.waitingForChanges.call();

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
      const { changedProjects, state } = await projectWatcher.waitForChange(onWaitingForChanges);

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

      const operations: Set<Operation> = await this.hooks.createOperations.promise(new Set(), {
        ...initialCreateOperationsContext,
        isInitial: false,
        projectChangeAnalyzer: state,
        projectSelection,
        phaseSelection
      });

      const executeOptions: IExecutionOperationsOptions = {
        // For now, don't run pre-build or post-build in watch mode
        ignoreHooks: true,
        operations,
        stopwatch,
        isWatch: true,
        executionManagerOptions,
        terminal
      };

      try {
        // Delegate the the underlying command, for only the projects that need reprocessing
        await this._executeOperations(executeOptions);
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
          ' The COUNT should be a positive integer, a percentage value (eg. "50%%") or the word "max"' +
          ' to specify a count that is equal to the number of CPU cores. If this parameter is omitted,' +
          ' then the default value depends on the operating system and number of CPU cores.'
      });
      this._timelineParameter = this.defineFlagParameter({
        parameterLongName: '--timeline',
        description:
          'After the build is complete, print additional statistics and CPU usage information,' +
          ' including an ASCII chart of the start and stop times for each operation.'
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

    if (this._watchPhases.size > 0 && !this._alwaysWatch) {
      // Only define the parameter if it has an effect.
      this._watchParameter = this.defineFlagParameter({
        parameterLongName: '--watch',
        description: `Starts a file watcher after initial execution finishes. Will run the following phases on affected projects: ${Array.from(
          this._watchPhases,
          (phase: IPhase) => phase.name
        ).join(', ')}`
      });
    }

    // If undefined, the parameter is not supported.
    if (this._alwaysInstall === false) {
      this._installParameter = this.defineFlagParameter({
        parameterLongName: '--install',
        description:
          'Normally a phased command expects "rush install" to have been manually run first. If this flag is specified,' +
          'Rush will automatically perform an install before processing the current command.'
      });
    }

    this.defineScriptParameters();

    for (const [{ associatedPhases }, tsCommandLineParameter] of this.customParameters) {
      if (associatedPhases) {
        for (const phaseName of associatedPhases) {
          const phase: IPhase | undefined = this._knownPhases.get(phaseName);
          if (!phase) {
            throw new InternalError(`Could not find a phase matching ${phaseName}.`);
          }
          phase.associatedParameters.add(tsCommandLineParameter);
        }
      }
    }
  }

  /**
   * Runs a set of operations and reports the results.
   */
  private async _executeOperations(options: IExecutionOperationsOptions): Promise<void> {
    const { executionManagerOptions, ignoreHooks, operations, stopwatch, isWatch, terminal } = options;

    const executionManager: OperationExecutionManager = new OperationExecutionManager(
      operations,
      executionManagerOptions
    );

    try {
      await executionManager.executeAsync();

      stopwatch.stop();
      terminal.writeLine(colors.green(`rush ${this.actionName} (${stopwatch.toString()})`));

      if (!ignoreHooks) {
        this._doAfterTask(stopwatch, true);
      }
    } catch (error) {
      stopwatch.stop();

      if (error instanceof AlreadyReportedError) {
        terminal.writeLine(`rush ${this.actionName} (${stopwatch.toString()})`);
      } else {
        if (error && (error as Error).message) {
          if (this.parser.isDebug) {
            terminal.writeErrorLine('Error: ' + (error as Error).stack);
          } else {
            terminal.writeErrorLine('Error: ' + (error as Error).message);
          }
        }

        terminal.writeErrorLine(colors.red(`rush ${this.actionName} - Errors! (${stopwatch.toString()})`));
      }

      if (!ignoreHooks) {
        this._doAfterTask(stopwatch, false);
      }

      if (!isWatch) {
        throw new AlreadyReportedError();
      }
    }
  }

  private _doBeforeTask(): void {
    if (
      this.actionName !== RushConstants.buildCommandName &&
      this.actionName !== RushConstants.rebuildCommandName
    ) {
      // Only collects information for built-in commands like build or rebuild.
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
      // Only collects information for built-in commands like build or rebuild.
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
        durationInSeconds: stopwatch.duration,
        result: success ? 'Succeeded' : 'Failed',
        extraData
      });
    }
  }
}
