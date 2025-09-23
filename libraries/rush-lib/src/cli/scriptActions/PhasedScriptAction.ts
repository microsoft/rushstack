// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { once } from 'node:events';

import type { AsyncSeriesHook } from 'tapable';

import { AlreadyReportedError, InternalError } from '@rushstack/node-core-library';
import { Terminal, Colorize, StdioWritable } from '@rushstack/terminal';
import type { ITerminal } from '@rushstack/terminal';
import type {
  CommandLineFlagParameter,
  CommandLineParameter,
  CommandLineStringParameter
} from '@rushstack/ts-command-line';

import type { Subspace } from '../../api/Subspace';
import type { IPhasedCommand } from '../../pluginFramework/RushLifeCycle';
import {
  type IOperationGraphContext,
  type IOperationGraphIterationOptions,
  PhasedCommandHooks,
  type ICreateOperationsContext
} from '../../pluginFramework/PhasedCommandHooks';
import { SetupChecks } from '../../logic/SetupChecks';
import { Stopwatch } from '../../utilities/Stopwatch';
import { BaseScriptAction, type IBaseScriptActionOptions } from './BaseScriptAction';
import type { IOperationGraphOptions, IOperationGraphTelemetry } from '../../logic/operations/OperationGraph';
import { OperationGraph } from '../../logic/operations/OperationGraph';
import { RushConstants } from '../../logic/RushConstants';
import { EnvironmentVariableNames } from '../../api/EnvironmentConfiguration';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { BuildCacheConfiguration } from '../../api/BuildCacheConfiguration';
import { SelectionParameterSet } from '../parsing/SelectionParameterSet';
import type { IPhase, IPhasedCommandConfig } from '../../api/CommandLineConfiguration';
import type { Operation } from '../../logic/operations/Operation';
import { PhasedOperationPlugin } from '../../logic/operations/PhasedOperationPlugin';
import { ShellOperationRunnerPlugin } from '../../logic/operations/ShellOperationRunnerPlugin';
import { Event } from '../../api/EventHooks';
import { ProjectChangeAnalyzer } from '../../logic/ProjectChangeAnalyzer';
import { OperationStatus } from '../../logic/operations/OperationStatus';
import type { IExecutionResult } from '../../logic/operations/IOperationExecutionResult';
import { OperationResultSummarizerPlugin } from '../../logic/operations/OperationResultSummarizerPlugin';
import type { ITelemetryData } from '../../logic/Telemetry';
import { parseParallelism } from '../parsing/ParseParallelism';
import { CobuildConfiguration } from '../../api/CobuildConfiguration';
import { CacheableOperationPlugin } from '../../logic/operations/CacheableOperationPlugin';
import type { IInputsSnapshot, GetInputsSnapshotAsyncFn } from '../../logic/incremental/InputsSnapshot';
import { RushProjectConfiguration } from '../../api/RushProjectConfiguration';
import { LegacySkipPlugin } from '../../logic/operations/LegacySkipPlugin';
import { ValidateOperationsPlugin } from '../../logic/operations/ValidateOperationsPlugin';
import { ShardedPhasedOperationPlugin } from '../../logic/operations/ShardedPhaseOperationPlugin';
import { FlagFile } from '../../api/FlagFile';
import { getVariantAsync, VARIANT_PARAMETER } from '../../api/Variants';
import { Selection } from '../../logic/Selection';
import { NodeDiagnosticDirPlugin } from '../../logic/operations/NodeDiagnosticDirPlugin';
import { DebugHashesPlugin } from '../../logic/operations/DebugHashesPlugin';
import { measureAsyncFn, measureFn } from '../../utilities/performance';

const PERF_PREFIX: 'rush:phasedScriptAction' = 'rush:phasedScriptAction';

/**
 * Constructor parameters for PhasedScriptAction.
 */
export interface IPhasedScriptActionOptions extends IBaseScriptActionOptions<IPhasedCommandConfig> {
  enableParallelism: boolean;
  allowOversubscription: boolean;
  incremental: boolean;
  disableBuildCache: boolean;

  originalPhases: Set<IPhase>;
  initialPhases: Set<IPhase>;
  watchPhases: Set<IPhase>;
  includeAllProjectsInWatchGraph: boolean;
  phases: Map<string, IPhase>;

  alwaysWatch: boolean;
  alwaysInstall: boolean | undefined;

  watchDebounceMs: number | undefined;
}

interface IExecuteOperationsOptions {
  graph: OperationGraph;
  ignoreHooks: boolean;
  isWatch: boolean;
  stopwatch: Stopwatch;
  terminal: ITerminal;
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
export class PhasedScriptAction extends BaseScriptAction<IPhasedCommandConfig> implements IPhasedCommand {
  /**
   * @internal
   */
  public _runsBeforeInstall: boolean | undefined;
  public readonly hooks: PhasedCommandHooks;
  public readonly sessionAbortController: AbortController;

  private readonly _enableParallelism: boolean;
  private readonly _allowOversubscription: boolean;
  private readonly _isIncrementalBuildAllowed: boolean;
  private readonly _disableBuildCache: boolean;
  private readonly _originalPhases: ReadonlySet<IPhase>;
  private readonly _initialPhases: ReadonlySet<IPhase>;
  private readonly _watchPhases: ReadonlySet<IPhase>;
  private readonly _watchDebounceMs: number;
  private readonly _alwaysWatch: boolean;
  private readonly _alwaysInstall: boolean | undefined;
  private readonly _includeAllProjectsInWatchGraph: boolean;
  private readonly _knownPhases: ReadonlyMap<string, IPhase>;
  private readonly _terminal: ITerminal;

  private readonly _changedProjectsOnlyParameter: CommandLineFlagParameter | undefined;
  private readonly _selectionParameters: SelectionParameterSet;
  private readonly _verboseParameter: CommandLineFlagParameter;
  private readonly _parallelismParameter: CommandLineStringParameter | undefined;
  private readonly _ignoreHooksParameter: CommandLineFlagParameter;
  private readonly _watchParameter: CommandLineFlagParameter | undefined;
  private readonly _timelineParameter: CommandLineFlagParameter | undefined;
  private readonly _cobuildPlanParameter: CommandLineFlagParameter | undefined;
  private readonly _installParameter: CommandLineFlagParameter | undefined;
  private readonly _variantParameter: CommandLineStringParameter | undefined;
  private readonly _noIPCParameter: CommandLineFlagParameter | undefined;
  private readonly _nodeDiagnosticDirParameter: CommandLineStringParameter;
  private readonly _debugBuildCacheIdsParameter: CommandLineFlagParameter;
  private readonly _includePhaseDeps: CommandLineFlagParameter | undefined;

  public constructor(options: IPhasedScriptActionOptions) {
    super(options);
    this._enableParallelism = options.enableParallelism;
    this._allowOversubscription = options.allowOversubscription;
    this._isIncrementalBuildAllowed = options.incremental;
    this._disableBuildCache = options.disableBuildCache;
    this._originalPhases = options.originalPhases;
    this._initialPhases = options.initialPhases;
    this._watchPhases = options.watchPhases;
    this._watchDebounceMs = options.watchDebounceMs ?? RushConstants.defaultWatchDebounceMs;
    this._alwaysWatch = options.alwaysWatch;
    this._alwaysInstall = options.alwaysInstall;
    this._includeAllProjectsInWatchGraph = options.includeAllProjectsInWatchGraph;
    this._runsBeforeInstall = false;
    this._knownPhases = options.phases;
    this.sessionAbortController = new AbortController();

    this.hooks = new PhasedCommandHooks();

    this._terminal = new Terminal(this.rushSession.terminalProvider);

    this._parallelismParameter = this._enableParallelism
      ? this.defineStringParameter({
          parameterLongName: '--parallelism',
          parameterShortName: '-p',
          argumentName: 'COUNT',
          environmentVariable: EnvironmentVariableNames.RUSH_PARALLELISM,
          description:
            'Specifies the maximum number of concurrent processes to launch during a build.' +
            ' The COUNT should be a positive integer, a percentage value (eg. "50%") or the word "max"' +
            ' to specify a count that is equal to the number of CPU cores. If this parameter is omitted,' +
            ' then the default value depends on the operating system and number of CPU cores.'
        })
      : undefined;

    this._timelineParameter = this.defineFlagParameter({
      parameterLongName: '--timeline',
      description:
        'After the build is complete, print additional statistics and CPU usage information,' +
        ' including an ASCII chart of the start and stop times for each operation.'
    });
    this._cobuildPlanParameter = this.defineFlagParameter({
      parameterLongName: '--log-cobuild-plan',
      description:
        '(EXPERIMENTAL) Before the build starts, log information about the cobuild state. This will include information about ' +
        'clusters and the projects that are part of each cluster.'
    });

    this._selectionParameters = new SelectionParameterSet(this.rushConfiguration, this, {
      gitOptions: {
        // Include lockfile processing since this expands the selection, and we need to select
        // at least the same projects selected with the same query to "rush build"
        includeExternalDependencies: true,
        // Enable filtering to reduce evaluation cost
        enableFiltering: true
      },
      includeSubspaceSelector: false
    });

    this._verboseParameter = this.defineFlagParameter({
      parameterLongName: '--verbose',
      parameterShortName: '-v',
      description: 'Display the logs during the build, rather than just displaying the build status summary'
    });

    this._includePhaseDeps = this.defineFlagParameter({
      parameterLongName: '--include-phase-deps',
      description:
        'If the selected projects are "unsafe" (missing some dependencies), add the minimal set of phase dependencies. For example, ' +
        `"--from A" normally might include the "_phase:test" phase for A's dependencies, even though changes to A can't break those tests. ` +
        `Using "--impacted-by A --include-phase-deps" avoids that work by performing "_phase:test" only for downstream projects.`
    });

    this._changedProjectsOnlyParameter = this._isIncrementalBuildAllowed
      ? this.defineFlagParameter({
          parameterLongName: '--changed-projects-only',
          parameterShortName: '-c',
          description:
            'Normally the incremental build logic will rebuild changed projects as well as' +
            ' any projects that directly or indirectly depend on a changed project. Specify "--changed-projects-only"' +
            ' to ignore dependent projects, only rebuilding those projects whose files were changed.' +
            ' Note that this parameter is "unsafe"; it is up to the developer to ensure that the ignored projects' +
            ' are okay to ignore.'
        })
      : undefined;

    this._ignoreHooksParameter = this.defineFlagParameter({
      parameterLongName: '--ignore-hooks',
      description:
        `Skips execution of the "eventHooks" scripts defined in ${RushConstants.rushJsonFilename}. ` +
        'Make sure you know what you are skipping.'
    });

    // Only define the parameter if it has an effect.
    this._watchParameter =
      this._watchPhases.size > 0 && !this._alwaysWatch
        ? this.defineFlagParameter({
            parameterLongName: '--watch',
            description: `Starts a file watcher after initial execution finishes. Will run the following phases on affected projects: ${Array.from(
              this._watchPhases,
              (phase: IPhase) => phase.name
            ).join(', ')}`
          })
        : undefined;

    // If `this._alwaysInstall === undefined`, Rush does not define the parameter
    // but a repository may still define a custom parameter with the same name.
    this._installParameter =
      this._alwaysInstall === false
        ? this.defineFlagParameter({
            parameterLongName: '--install',
            description:
              'Normally a phased command expects "rush install" to have been manually run first. If this flag is specified, ' +
              'Rush will automatically perform an install before processing the current command.'
          })
        : undefined;

    this._variantParameter =
      this._alwaysInstall !== undefined ? this.defineStringParameter(VARIANT_PARAMETER) : undefined;

    const isIpcSupported: boolean =
      this._watchPhases.size > 0 &&
      !!this.rushConfiguration.experimentsConfiguration.configuration.useIPCScriptsInWatchMode;
    this._noIPCParameter = isIpcSupported
      ? this.defineFlagParameter({
          parameterLongName: '--no-ipc',
          description:
            'Disables the IPC feature for the current command (if applicable to selected operations). Operations will not look for a ":ipc" suffixed script.' +
            'This feature only applies in watch mode and is enabled by default.'
        })
      : undefined;

    this._nodeDiagnosticDirParameter = this.defineStringParameter({
      parameterLongName: '--node-diagnostic-dir',
      argumentName: 'DIRECTORY',
      description:
        'Specifies the directory where Node.js diagnostic reports will be written. ' +
        'This directory will contain a subdirectory for each project and phase.'
    });

    this._debugBuildCacheIdsParameter = this.defineFlagParameter({
      parameterLongName: '--debug-build-cache-ids',
      description:
        'Logs information about the components of the build cache ids for individual operations. This is useful for debugging the incremental build logic.'
    });

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

  public async runAsync(): Promise<void> {
    const stopwatch: Stopwatch = Stopwatch.start();

    if (this._alwaysInstall || this._installParameter?.value) {
      await measureAsyncFn(`${PERF_PREFIX}:install`, async () => {
        const { doBasicInstallAsync } = await import(
          /* webpackChunkName: 'doBasicInstallAsync' */
          '../../logic/installManager/doBasicInstallAsync'
        );

        const variant: string | undefined = await getVariantAsync(
          this._variantParameter,
          this.rushConfiguration,
          true
        );
        await doBasicInstallAsync({
          terminal: this._terminal,
          rushConfiguration: this.rushConfiguration,
          rushGlobalFolder: this.rushGlobalFolder,
          isDebug: this.parser.isDebug,
          variant,
          beforeInstallAsync: (subspace: Subspace) =>
            this.rushSession.hooks.beforeInstall.promise(this, subspace, variant),
          afterInstallAsync: (subspace: Subspace) =>
            this.rushSession.hooks.afterInstall.promise(this, subspace, variant),
          // Eventually we may want to allow a subspace to be selected here
          subspace: this.rushConfiguration.defaultSubspace
        });
      });
    }

    if (!this._runsBeforeInstall) {
      await measureAsyncFn(`${PERF_PREFIX}:checkInstallFlag`, async () => {
        // TODO: Replace with last-install.flag when "rush link" and "rush unlink" are removed
        const lastLinkFlag: FlagFile = new FlagFile(
          this.rushConfiguration.defaultSubspace.getSubspaceTempFolderPath(),
          RushConstants.lastLinkFlagFilename,
          {}
        );
        // Only check for a valid link flag when subspaces is not enabled
        if (!(await lastLinkFlag.isValidAsync()) && !this.rushConfiguration.subspacesFeatureEnabled) {
          const useWorkspaces: boolean =
            this.rushConfiguration.pnpmOptions && this.rushConfiguration.pnpmOptions.useWorkspaces;
          if (useWorkspaces) {
            throw new Error('Link flag invalid.\nDid you run "rush install" or "rush update"?');
          } else {
            throw new Error('Link flag invalid.\nDid you run "rush link"?');
          }
        }
      });
    }

    measureFn(`${PERF_PREFIX}:doBeforeTask`, () => this._doBeforeTask());

    const hooks: PhasedCommandHooks = this.hooks;
    const terminal: ITerminal = this._terminal;

    // if this is parallelizable, then use the value from the flag (undefined or a number),
    // if parallelism is not enabled, then restrict to 1 core
    const parallelism: number = this._enableParallelism
      ? parseParallelism(this._parallelismParameter?.value)
      : 1;

    await measureAsyncFn(`${PERF_PREFIX}:applyStandardPlugins`, async () => {
      // Generates the default operation graph
      new PhasedOperationPlugin().apply(hooks);
      // Splices in sharded phases to the operation graph.
      new ShardedPhasedOperationPlugin().apply(hooks);
      // Applies the Shell Operation Runner to selected operations
      new ShellOperationRunnerPlugin().apply(hooks);
      // Verifies correctness of rush-project.json entries for the graph
      new ValidateOperationsPlugin(terminal).apply(hooks);

      const showTimeline: boolean = this._timelineParameter?.value ?? false;
      if (showTimeline) {
        const { ConsoleTimelinePlugin } = await import(
          /* webpackChunkName: 'ConsoleTimelinePlugin' */
          '../../logic/operations/ConsoleTimelinePlugin'
        );
        new ConsoleTimelinePlugin(terminal).apply(this.hooks);
      }

      const diagnosticDir: string | undefined = this._nodeDiagnosticDirParameter.value;
      if (diagnosticDir) {
        new NodeDiagnosticDirPlugin({
          diagnosticDir
        }).apply(this.hooks);
      }

      // Enable the standard summary
      new OperationResultSummarizerPlugin(terminal).apply(this.hooks);
    });

    const { hooks: sessionHooks } = this.rushSession;
    if (sessionHooks.runAnyPhasedCommand.isUsed()) {
      await measureAsyncFn(`${PERF_PREFIX}:runAnyPhasedCommand`, async () => {
        // Avoid the cost of compiling the hook if it wasn't tapped.
        await sessionHooks.runAnyPhasedCommand.promise(this);
      });
    }

    const hookForAction: AsyncSeriesHook<IPhasedCommand> | undefined = sessionHooks.runPhasedCommand.get(
      this.actionName
    );

    if (hookForAction) {
      await measureAsyncFn(`${PERF_PREFIX}:runPhasedCommand`, async () => {
        // Run the more specific hook for a command with this name after the general hook
        await hookForAction.promise(this);
      });
    }

    const isQuietMode: boolean = !this._verboseParameter.value;

    const changedProjectsOnly: boolean = !!this._changedProjectsOnlyParameter?.value;

    let buildCacheConfiguration: BuildCacheConfiguration | undefined;
    let cobuildConfiguration: CobuildConfiguration | undefined;
    if (!this._disableBuildCache) {
      await measureAsyncFn(`${PERF_PREFIX}:configureBuildCache`, async () => {
        [buildCacheConfiguration, cobuildConfiguration] = await Promise.all([
          BuildCacheConfiguration.tryLoadAsync(terminal, this.rushConfiguration, this.rushSession),
          CobuildConfiguration.tryLoadAsync(terminal, this.rushConfiguration, this.rushSession).then(
            async (cobuildCfg: CobuildConfiguration | undefined) => {
              if (cobuildCfg) {
                await cobuildCfg.createLockProviderAsync(terminal);
              }
              return cobuildCfg;
            }
          )
        ]);
      });
    }

    const isWatch: boolean = this._watchParameter?.value || this._alwaysWatch;
    const generateFullGraph: boolean = isWatch && this._includeAllProjectsInWatchGraph;

    try {
      const projectSelection: Set<RushConfigurationProject> = await measureAsyncFn(
        `${PERF_PREFIX}:getSelectedProjects`,
        () => this._selectionParameters.getSelectedProjectsAsync(terminal, generateFullGraph)
      );

      const customParametersByName: Map<string, CommandLineParameter> = new Map();
      for (const [configParameter, parserParameter] of this.customParameters) {
        customParametersByName.set(configParameter.longName, parserParameter);
      }

      if (!generateFullGraph && !projectSelection.size) {
        terminal.writeLine(
          Colorize.yellow(`The command line selection parameters did not match any projects.`)
        );
        return;
      }

      await measureAsyncFn(`${PERF_PREFIX}:applySituationalPlugins`, async () => {
        if (isWatch && this._noIPCParameter?.value === false) {
          new (
            await import(
              /* webpackChunkName: 'IPCOperationRunnerPlugin' */ '../../logic/operations/IPCOperationRunnerPlugin'
            )
          ).IPCOperationRunnerPlugin().apply(this.hooks);
        }

        if (buildCacheConfiguration?.buildCacheEnabled) {
          terminal.writeVerboseLine(`Incremental strategy: cache restoration`);
          new CacheableOperationPlugin({
            allowWarningsInSuccessfulBuild:
              !!this.rushConfiguration.experimentsConfiguration.configuration
                .buildCacheWithAllowWarningsInSuccessfulBuild,
            buildCacheConfiguration,
            cobuildConfiguration,
            terminal
          }).apply(this.hooks);

          if (this._debugBuildCacheIdsParameter.value) {
            new DebugHashesPlugin(terminal).apply(this.hooks);
          }
        } else if (!this._disableBuildCache) {
          terminal.writeVerboseLine(`Incremental strategy: output preservation`);
          // Explicitly disabling the build cache also disables legacy skip detection.
          new LegacySkipPlugin({
            allowWarningsInSuccessfulBuild:
              this.rushConfiguration.experimentsConfiguration.configuration
                .buildSkipWithAllowWarningsInSuccessfulBuild,
            terminal,
            changedProjectsOnly,
            isIncrementalBuildAllowed: this._isIncrementalBuildAllowed
          }).apply(this.hooks);
        } else {
          terminal.writeVerboseLine(`Incremental strategy: none (full rebuild)`);
        }

        const showBuildPlan: boolean = this._cobuildPlanParameter?.value ?? false;

        if (showBuildPlan) {
          if (!buildCacheConfiguration?.buildCacheEnabled) {
            throw new Error('You must have build cache enabled to use this option.');
          }
          const { BuildPlanPlugin } = await import('../../logic/operations/BuildPlanPlugin');
          new BuildPlanPlugin(terminal).apply(this.hooks);
        }

        const { configuration: experiments } = this.rushConfiguration.experimentsConfiguration;
        if (this.rushConfiguration?.isPnpm && experiments?.usePnpmSyncForInjectedDependencies) {
          const { PnpmSyncCopyOperationPlugin } = await import(
            '../../logic/operations/PnpmSyncCopyOperationPlugin'
          );
          new PnpmSyncCopyOperationPlugin(terminal).apply(this.hooks);
        }
      });

      const relevantProjects: Set<RushConfigurationProject> = generateFullGraph
        ? new Set(this.rushConfiguration.projects)
        : Selection.expandAllDependencies(projectSelection);

      const projectConfigurations: ReadonlyMap<RushConfigurationProject, RushProjectConfiguration> = this
        ._runsBeforeInstall
        ? new Map()
        : await measureAsyncFn(`${PERF_PREFIX}:loadProjectConfigurations`, () =>
            RushProjectConfiguration.tryLoadForProjectsAsync(relevantProjects, terminal)
          );

      const includePhaseDeps: boolean = this._includePhaseDeps?.value ?? false;

      const createOperationsContext: ICreateOperationsContext = {
        buildCacheConfiguration,
        cobuildConfiguration,
        customParameters: customParametersByName,
        changedProjectsOnly,
        includePhaseDeps,
        isIncrementalBuildAllowed: this._isIncrementalBuildAllowed,
        isWatch,
        rushConfiguration: this.rushConfiguration,
        parallelism,
        phaseSelection: isWatch
          ? this._watchPhases
          : includePhaseDeps
            ? this._originalPhases
            : this._initialPhases,
        projectSelection,
        generateFullGraph,
        projectConfigurations
      };

      const operations: Set<Operation> = await measureAsyncFn(`${PERF_PREFIX}:createOperations`, () =>
        this.hooks.createOperationsAsync.promise(new Set(), createOperationsContext)
      );

      const [getInputsSnapshotAsync, initialSnapshot] = await measureAsyncFn(
        `${PERF_PREFIX}:analyzeRepoState`,
        async () => {
          terminal.write('Analyzing repo state... ');
          const repoStateStopwatch: Stopwatch = new Stopwatch();
          repoStateStopwatch.start();

          const analyzer: ProjectChangeAnalyzer = new ProjectChangeAnalyzer(this.rushConfiguration);
          const innerGetInputsSnapshotAsync: GetInputsSnapshotAsyncFn | undefined =
            await analyzer._tryGetSnapshotProviderAsync(
              projectConfigurations,
              terminal,
              // We need to include all dependencies, otherwise build cache id calculation will be incorrect
              relevantProjects
            );
          const innerInitialSnapshot: IInputsSnapshot | undefined = innerGetInputsSnapshotAsync
            ? await innerGetInputsSnapshotAsync()
            : undefined;

          repoStateStopwatch.stop();
          terminal.writeLine(`DONE (${repoStateStopwatch.toString()})`);
          terminal.writeLine();
          return [innerGetInputsSnapshotAsync, innerInitialSnapshot];
        }
      );

      let executionTelemetryHandler: IOperationGraphTelemetry | undefined;
      const { telemetry: parserTelemetry } = this.parser;
      if (parserTelemetry) {
        const { _changedProjectsOnlyParameter: changedProjectsOnlyParameter } = this;
        executionTelemetryHandler = {
          changedProjectsOnlyKey:
            changedProjectsOnlyParameter?.scopedLongName ?? changedProjectsOnlyParameter?.longName,
          initialExtraData: {
            // Fields preserved across the command invocation
            ...this._selectionParameters.getTelemetry(),
            ...this.getParameterStringMap()
          },
          nameForLog: this.actionName,
          log: (logEntry: ITelemetryData) => {
            measureFn(`${PERF_PREFIX}:beforeLog`, () => hooks.beforeLog.call(logEntry));
            parserTelemetry.log(logEntry);
            parserTelemetry.flush();
          }
        };
      }

      const graphOptions: IOperationGraphOptions = {
        quietMode: isQuietMode,
        debugMode: this.parser.isDebug,
        destinations: [StdioWritable.instance],
        parallelism,
        allowOversubscription: this._allowOversubscription,
        isWatch,
        pauseNextIteration: false,
        getInputsSnapshotAsync,
        abortController: this.sessionAbortController,
        telemetry: executionTelemetryHandler
      };

      const graph: OperationGraph = new OperationGraph(operations, graphOptions);

      const graphContext: IOperationGraphContext = {
        ...createOperationsContext,
        initialSnapshot
      };

      const abortPromise: Promise<void> = once(this.sessionAbortController.signal, 'abort').then(() => {
        terminal.writeLine(`Exiting watch mode...`);
        return graph.abortCurrentIterationAsync();
      });

      await measureAsyncFn(`${PERF_PREFIX}:executionManager`, async () => {
        await hooks.onGraphCreatedAsync.promise(graph, graphContext);
      });

      const executeOptions: IExecuteOperationsOptions = {
        graph,
        ignoreHooks: !!this._ignoreHooksParameter.value,
        isWatch,
        stopwatch,
        terminal
      };

      const initialIterationOptions: IOperationGraphIterationOptions = {
        inputsSnapshot: initialSnapshot,
        // Mark as starting at time 0, which is process startup.
        startTime: 0
      };
      if (isWatch) {
        if (!initialSnapshot) {
          terminal.writeErrorLine(`Unable to run in watch mode: could not analyze repository state`);
          throw new AlreadyReportedError();
        }

        if (buildCacheConfiguration) {
          // Cache writes are not supported during watch mode, only reads.
          buildCacheConfiguration.cacheWriteEnabled = false;
        }

        const { ProjectWatcher } = await import(
          /* webpackChunkName: 'ProjectWatcher' */
          '../../logic/ProjectWatcher'
        );
        const watcher: typeof ProjectWatcher.prototype = new ProjectWatcher({
          rushConfiguration: this.rushConfiguration,
          graph,
          initialSnapshot,
          terminal,
          debounceMs: this._watchDebounceMs
        });
        watcher.clearStatus();

        await measureAsyncFn(`${PERF_PREFIX}:executeOperationsInner`, async () => {
          return await graph.executeAsync(initialIterationOptions);
        });

        await abortPromise;

        terminal.writeLine(`Watch mode exited.`);
      } else {
        await measureAsyncFn(`${PERF_PREFIX}:runInitialPhases`, () =>
          measureAsyncFn(`${PERF_PREFIX}:executeOperations`, () =>
            this._executeOperationsAsync(executeOptions, initialIterationOptions)
          )
        );
      }
    } finally {
      if (cobuildConfiguration) {
        await cobuildConfiguration.destroyLockProviderAsync();
      }
    }
  }

  /**
   * Runs a set of operations and reports the results.
   */
  private async _executeOperationsAsync(
    options: IExecuteOperationsOptions,
    iterationOptions: IOperationGraphIterationOptions
  ): Promise<void> {
    const { graph, ignoreHooks, stopwatch, isWatch, terminal } = options;

    let success: boolean = false;
    let result: IExecutionResult | undefined;

    if (iterationOptions.startTime) {
      (stopwatch as { startTime: number }).startTime = iterationOptions.startTime;
    }

    try {
      const definiteResult: IExecutionResult = await measureAsyncFn(
        `${PERF_PREFIX}:executeOperationsInner`,
        async () => {
          return await graph.executeAsync(iterationOptions);
        }
      );
      success = definiteResult.status === OperationStatus.Success;
      result = definiteResult;

      stopwatch.stop();

      const message: string = `rush ${this.actionName} (${stopwatch.toString()})`;
      if (result.status === OperationStatus.Success) {
        terminal.writeLine(Colorize.green(message));
      } else {
        terminal.writeLine(message);
      }
    } catch (error) {
      success = false;
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

        terminal.writeErrorLine(Colorize.red(`rush ${this.actionName} - Errors! (${stopwatch.toString()})`));
      }
    }

    if (!ignoreHooks) {
      measureFn(`${PERF_PREFIX}:doAfterTask`, () => this._doAfterTask());
    }

    if (!success && !isWatch) {
      throw new AlreadyReportedError();
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

  private _doAfterTask(): void {
    if (
      this.actionName !== RushConstants.buildCommandName &&
      this.actionName !== RushConstants.rebuildCommandName
    ) {
      // Only collects information for built-in commands like build or rebuild.
      return;
    }
    this.eventHooksManager.handle(Event.postRushBuild, this.parser.isDebug, this._ignoreHooksParameter.value);
  }
}
