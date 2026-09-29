// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { once } from 'node:events';
import * as path from 'node:path';

import type { AsyncSeriesHook } from 'tapable';

import { AlreadyReportedError, EnvironmentMap, Sort } from '@rushstack/node-core-library';
import {
  type ITerminal,
  Terminal,
  Colorize,
  StdioWritable,
  CallbackWritable,
  NoOpTerminalProvider
} from '@rushstack/terminal';
import type {
  CommandLineFlagParameter,
  CommandLineParameter,
  CommandLineStringParameter
} from '@rushstack/ts-command-line';

import type { Subspace } from '../../api/Subspace';
import type { IPhasedCommand } from '../../pluginFramework/RushLifeCycle';
import {
  type IOperationGraphContext,
  PhasedCommandHooks,
  type ICreateOperationsContext
} from '../../pluginFramework/PhasedCommandHooks';
import type {
  IOperationGraph,
  IOperationGraphIterationOptions
} from '../../logic/operations/IOperationGraph';
import type {
  IPhasedCommandEngine,
  IPhasedCommandEngineRequestSettings
} from '../../api/PhasedCommandEngine';
import { PhasedCommandEngineConfigurationChangedError } from '../../api/PhasedCommandEngineConfigurationChangedError';
import { getDaemonIpcImplementationIdentityAsync } from '../../logic/operations/DaemonIpcConfiguration';
import { SetupChecks } from '../../logic/SetupChecks';
import { Stopwatch } from '../../utilities/Stopwatch';
import { BaseScriptAction, type IBaseScriptActionOptions } from './BaseScriptAction';
import type { IOperationGraphOptions, IOperationGraphTelemetry } from '../../logic/operations/OperationGraph';
import { OperationGraph } from '../../logic/operations/OperationGraph';
import type { IPhasedCommandTelemetryFields } from '../../logic/operations/PhasedCommandTelemetry';
import { RushConstants } from '../../logic/RushConstants';
import { EnvironmentVariableNames } from '../../api/EnvironmentConfiguration';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { BuildCacheConfiguration } from '../../api/BuildCacheConfiguration';
import { SelectionParameterSet } from '../parsing/SelectionParameterSet';
import type { IGitSelectorParserOptions } from '../../logic/selectors/GitChangedProjectSelectorParser';
import type { IPhase, IPhasedCommandConfig } from '../../api/CommandLineConfiguration';
import type { Operation, OperationEnabledState } from '../../logic/operations/Operation';
import { associateParametersByPhase } from '../parsing/associateParametersByPhase';
import { PhasedOperationPlugin } from '../../logic/operations/PhasedOperationPlugin';
import { ShellOperationRunnerPlugin } from '../../logic/operations/ShellOperationRunnerPlugin';
import { Event } from '../../api/EventHooks';
import {
  ProjectChangeAnalyzer,
  tryGetMissingProjectShrinkwrapFileErrorAsync
} from '../../logic/ProjectChangeAnalyzer';
import { OperationStatus } from '../../logic/operations/OperationStatus';
import type {
  IExecutionResult,
  IOperationExecutionResult
} from '../../logic/operations/IOperationExecutionResult';
import { OperationResultSummarizerPlugin } from '../../logic/operations/OperationResultSummarizerPlugin';
import type { ITelemetryData } from '../../logic/Telemetry';
import {
  getNumberOfCores,
  parseParallelism,
  type Parallelism
} from '../../logic/operations/ParseParallelism';
import { CobuildConfiguration } from '../../api/CobuildConfiguration';
import { CacheableOperationPlugin } from '../../logic/operations/CacheableOperationPlugin';
import type { IInputsSnapshot, GetInputsSnapshotAsyncFn } from '../../logic/incremental/InputsSnapshot';
import { RushProjectConfiguration } from '../../api/RushProjectConfiguration';
import { LegacySkipInvalidationPlugin, LegacySkipPlugin } from '../../logic/operations/LegacySkipPlugin';
import { ValidateOperationsPlugin } from '../../logic/operations/ValidateOperationsPlugin';
import { ShardedPhasedOperationPlugin } from '../../logic/operations/ShardedPhaseOperationPlugin';
import { FlagFile } from '../../api/FlagFile';
import { getVariantAsync, VARIANT_PARAMETER } from '../../api/Variants';
import { Selection } from '../../logic/Selection';
import { NodeDiagnosticDirPlugin } from '../../logic/operations/NodeDiagnosticDirPlugin';
import { IgnoredParametersPlugin } from '../../logic/operations/IgnoredParametersPlugin';
import { TrimRushEnvironmentVariablesPlugin } from '../../logic/operations/TrimRushEnvironmentVariablesPlugin';
import { DebugHashesPlugin } from '../../logic/operations/DebugHashesPlugin';
import { measureAsyncFn, measureFn } from '../../utilities/performance';
import { runDuringChecksAsync } from '../../utilities/runDuringChecksAsync';
import {
  formatClosedOutputNotice,
  type IClosedStandardOutput,
  type StandardOutputClosure
} from '../../utilities/StandardOutputClosure';
import { attachReporterOperationEventSink } from '../../logic/operations/ReporterOperationEventSink';
import { _isRushSessionOperationStreamEnabled } from '../../pluginFramework/RushSession';

const PERF_PREFIX: 'rush:phasedScriptAction' = 'rush:phasedScriptAction';

/**
 * Parameters that change neither the operation graph nor any operation hash. A long-lived engine applies
 * them per request (see `getEngineRequestSettings`), so they are excluded from the engine parameter identity.
 * `--timeline` only adds a presentation plugin whose output is discarded by engine hosts.
 */
const ENGINE_REQUEST_SCOPED_PARAMETER_NAMES: ReadonlySet<string> = new Set([
  '--verbose',
  '--parallelism',
  '--timeline'
]);

/**
 * Parameters that are part of the engine parameter identity, but that do not keep an engine created by one command
 * from serving another command (see `getEngineGraphIdentity`). An engine never runs build event-hook scripts, and
 * it selects the operations of each request with the request's own `--include-phase-deps`.
 */
const ENGINE_SHAREABLE_PARAMETER_NAMES: ReadonlySet<string> = new Set([
  '--ignore-hooks',
  '--include-phase-deps'
]);

/**
 * The phases of an engine's graph and of one request, by name; see `PhasedScriptAction.getEnginePhaseNames`.
 */
export interface IEnginePhaseNames {
  /** The phases for which the graph of an engine created by this command has an operation of every project. */
  readonly complete: ReadonlySet<string>;
  /** The phases whose operations a request of this command selects for each project that it selects. */
  readonly selected: ReadonlySet<string>;
  /** Every phase that a request of this command can run: its selected phases and all of their dependencies. */
  readonly reachable: ReadonlySet<string>;
}

/**
 * The set of overall execution statuses that mean the command did what was asked of it and should
 * exit with code 0.
 *
 * - `NoOp` -- the iteration scheduled no non-silent operations. This happens when a plugin
 *   legitimately consumes the work itself, either by returning an empty operation set from
 *   `createOperationsAsync` or by disabling every operation during `configureIteration` (a disabled
 *   record is silent, so both routes converge on this status).
 * - `Skipped` / `FromCache` -- a tap short-circuited the iteration with a successful bail status,
 *   for example the bridge-cache plugin performing a cache read/write out of band.
 *
 * `PhasedScriptAction` already treats an empty *project* selection as success, so treating an empty
 * *operation* set as a failure would be inconsistent. `SuccessWithWarning` is deliberately excluded
 * because non-allowed warnings are expected to fail the command.
 */
const SUCCESSFUL_EXECUTION_STATUSES: ReadonlySet<OperationStatus> = new Set([
  OperationStatus.Success,
  OperationStatus.Skipped,
  OperationStatus.FromCache,
  OperationStatus.NoOp
]);

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

  readonly #enableParallelism: boolean;
  readonly #allowOversubscription: boolean;
  readonly #isIncrementalBuildAllowed: boolean;
  readonly #disableBuildCache: boolean;
  readonly #originalPhases: ReadonlySet<IPhase>;
  readonly #initialPhases: ReadonlySet<IPhase>;
  readonly #watchPhases: ReadonlySet<IPhase>;
  readonly #watchDebounceMs: number;
  readonly #alwaysWatch: boolean;
  readonly #alwaysInstall: boolean | undefined;
  readonly #includeAllProjectsInWatchGraph: boolean;
  readonly #phases: ReadonlyMap<string, IPhase>;
  readonly #terminal: ITerminal;
  readonly #engineEnvironment: Readonly<Record<string, string | undefined>> | undefined;

  readonly #changedProjectsOnlyParameter: CommandLineFlagParameter | undefined;
  readonly #selectionParameters: SelectionParameterSet;
  readonly #verboseParameter: CommandLineFlagParameter;
  readonly #parallelismParameter: CommandLineStringParameter | undefined;
  readonly #ignoreHooksParameter: CommandLineFlagParameter;
  readonly #watchParameter: CommandLineFlagParameter | undefined;
  readonly #timelineParameter: CommandLineFlagParameter | undefined;
  readonly #cobuildPlanParameter: CommandLineFlagParameter | undefined;
  readonly #installParameter: CommandLineFlagParameter | undefined;
  readonly #variantParameter: CommandLineStringParameter | undefined;
  readonly #noIPCParameter: CommandLineFlagParameter | undefined;
  readonly #nodeDiagnosticDirParameter: CommandLineStringParameter;
  readonly #debugBuildCacheIdsParameter: CommandLineFlagParameter;
  readonly #includePhaseDeps: CommandLineFlagParameter | undefined;

  public constructor(options: IPhasedScriptActionOptions) {
    super(options);
    const {
      enableParallelism,
      allowOversubscription,
      incremental,
      disableBuildCache,
      originalPhases,
      initialPhases,
      watchPhases,
      watchDebounceMs = RushConstants.defaultWatchDebounceMs,
      alwaysWatch,
      alwaysInstall,
      includeAllProjectsInWatchGraph,
      phases
    } = options;
    this.#enableParallelism = enableParallelism;
    this.#allowOversubscription = allowOversubscription;
    this.#isIncrementalBuildAllowed = incremental;
    this.#disableBuildCache = disableBuildCache;
    this.#originalPhases = originalPhases;
    this.#initialPhases = initialPhases;
    this.#watchPhases = watchPhases;
    this.#watchDebounceMs = watchDebounceMs;
    this.#alwaysWatch = alwaysWatch;
    this.#alwaysInstall = alwaysInstall;
    this.#includeAllProjectsInWatchGraph = includeAllProjectsInWatchGraph;
    this.#phases = phases;
    this._runsBeforeInstall = false;
    this.sessionAbortController = new AbortController();

    this.hooks = new PhasedCommandHooks();

    this.#terminal = new Terminal(this.rushSession.terminalProvider);
    this.#engineEnvironment = options.parser.engineEnvironment;

    this.#parallelismParameter = this.#enableParallelism
      ? this.defineStringParameter({
          parameterLongName: '--parallelism',
          parameterShortName: '-p',
          argumentName: 'COUNT',
          // An engine host reads this default from the request's environment instead; see #getParallelism().
          environmentVariable: this.#engineEnvironment
            ? undefined
            : EnvironmentVariableNames.RUSH_PARALLELISM,
          description:
            'Specifies the maximum number of concurrent processes to launch during a build.' +
            ' The COUNT should be a positive integer, a percentage value (eg. "50%") or the word "max"' +
            ' to specify a count that is equal to the number of CPU cores. If this parameter is omitted,' +
            ' then the default value depends on the operating system and number of CPU cores.'
        })
      : undefined;

    this.#timelineParameter = this.defineFlagParameter({
      parameterLongName: '--timeline',
      description:
        'After the build is complete, print additional statistics and CPU usage information,' +
        ' including an ASCII chart of the start and stop times for each operation.'
    });
    this.#cobuildPlanParameter = this.defineFlagParameter({
      parameterLongName: '--log-cobuild-plan',
      description:
        '(EXPERIMENTAL) Before the build starts, log information about the cobuild state. This will include information about ' +
        'clusters and the projects that are part of each cluster.'
    });

    this.#selectionParameters = new SelectionParameterSet(this.rushConfiguration, this, {
      gitOptions: {
        includeExternalDependencies: true,
        enableFiltering: true
      },
      includeSubspaceSelector: false,
      cwd: this.parser.cwd
    });

    this.#verboseParameter = this.defineFlagParameter({
      parameterLongName: '--verbose',
      parameterShortName: '-v',
      description: 'Display the logs during the build, rather than just displaying the build status summary'
    });

    this.#includePhaseDeps = this.defineFlagParameter({
      parameterLongName: '--include-phase-deps',
      description:
        'If the selected projects are "unsafe" (missing some dependencies), add the minimal set of phase dependencies. For example, ' +
        `"--from A" normally might include the "_phase:test" phase for A's dependencies, even though changes to A can't break those tests. ` +
        `Using "--impacted-by A --include-phase-deps" avoids that work by performing "_phase:test" only for downstream projects.`
    });

    this.#changedProjectsOnlyParameter = this.#isIncrementalBuildAllowed
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

    this.#ignoreHooksParameter = this.defineFlagParameter({
      parameterLongName: '--ignore-hooks',
      description:
        `Skips execution of the "eventHooks" scripts defined in ${RushConstants.rushJsonFilename}. ` +
        'Make sure you know what you are skipping.'
    });

    // Only define the parameter if it has an effect.
    this.#watchParameter =
      this.#watchPhases.size > 0 && !this.#alwaysWatch
        ? this.defineFlagParameter({
            parameterLongName: '--watch',
            description: `Starts a file watcher after initial execution finishes. Will run the following phases on affected projects: ${Array.from(
              this.#watchPhases,
              (phase: IPhase) => phase.name
            ).join(', ')}`
          })
        : undefined;

    // If `this._alwaysInstall === undefined`, Rush does not define the parameter
    // but a repository may still define a custom parameter with the same name.
    this.#installParameter =
      this.#alwaysInstall === false
        ? this.defineFlagParameter({
            parameterLongName: '--install',
            description:
              'Normally a phased command expects "rush install" to have been manually run first. If this flag is specified, ' +
              'Rush will automatically perform an install before processing the current command.'
          })
        : undefined;

    this.#variantParameter =
      this.#alwaysInstall !== undefined ? this.defineStringParameter(VARIANT_PARAMETER) : undefined;

    const isIpcSupported: boolean =
      this.#watchPhases.size > 0 &&
      !!this.rushConfiguration.experimentsConfiguration.configuration.useIPCScriptsInWatchMode;
    this.#noIPCParameter = isIpcSupported
      ? this.defineFlagParameter({
          parameterLongName: '--no-ipc',
          description:
            'Disables the IPC feature for the current command (if applicable to selected operations). Operations will not look for a ":ipc" suffixed script.' +
            'This feature only applies in watch mode and is enabled by default.'
        })
      : undefined;

    this.#nodeDiagnosticDirParameter = this.defineStringParameter({
      parameterLongName: '--node-diagnostic-dir',
      argumentName: 'DIRECTORY',
      description:
        'Specifies the directory where Node.js diagnostic reports will be written. ' +
        'This directory will contain a subdirectory for each project and phase.'
    });

    this.#debugBuildCacheIdsParameter = this.defineFlagParameter({
      parameterLongName: '--debug-build-cache-ids',
      description:
        'Logs information about the components of the build cache ids for individual operations. This is useful for debugging the incremental build logic.'
    });

    this.defineScriptParameters();

    // Associate parameters with their respective phases
    associateParametersByPhase(this.customParameters, phases);
  }

  public async runAsync(): Promise<void> {
    await this.#runAsync();
  }

  /** False when every run executes all selected operations: `rebuild`, or `"incremental": false`. */
  public get isIncrementalBuildAllowed(): boolean {
    return this.#isIncrementalBuildAllowed;
  }

  /**
   * Whether an engine created by this command runs the operations that declare `daemonIpc` in persistent
   * Node IPC processes. `DaemonIpcOperationRunnerPlugin` installs those runners only for an incremental
   * command.
   */
  public get usesPersistentIpcRunners(): boolean {
    return (
      this.#isIncrementalBuildAllowed &&
      this.rushConfiguration.daemon.usePersistentIpcRunners &&
      !this.#noIPCParameter?.value
    );
  }

  /** The names of every phase this command can schedule, including dependency and watch phases. */
  public get schedulablePhaseNames(): ReadonlySet<string> {
    const phaseNames: Set<string> = new Set();
    for (const phases of [this.#originalPhases, this.#initialPhases, this.#watchPhases]) {
      for (const phase of phases) {
        phaseNames.add(phase.name);
      }
    }
    return phaseNames;
  }

  public validateEngineCommand(): void {
    if (
      this.#alwaysWatch ||
      this.#watchParameter?.value ||
      this.#alwaysInstall ||
      this.#installParameter?.value ||
      this.#nodeDiagnosticDirParameter.value ||
      this.#variantParameter?.value
    ) {
      throw new Error('Watch, install, variant and diagnostic-directory options require --no-daemon.');
    }
    if (
      this.#runsBuildEventHooks() &&
      !this.#ignoreHooksParameter.value &&
      (this.rushConfiguration.eventHooks.get(Event.preRushBuild).length ||
        this.rushConfiguration.eventHooks.get(Event.postRushBuild).length)
    ) {
      throw new Error('Build event-hook scripts require --no-daemon (or an explicit --ignore-hooks).');
    }
  }

  public getEngineParameterIdentity(): string {
    const selectionNames: ReadonlySet<string> = this.#selectionParameters.parameterNames;
    return JSON.stringify([
      this.actionName,
      this.parser.getParameterStringMap(),
      Object.entries(this.getParameterStringMap()).filter(
        ([name]) => !selectionNames.has(name) && !ENGINE_REQUEST_SCOPED_PARAMETER_NAMES.has(name)
      )
    ]);
  }

  /**
   * The phases of the graph of an engine created by this command, and of the operations of one request of it.
   *
   * @remarks
   * An engine creates operations of every project for the phases that the command selects, and, through their
   * dependencies, operations of the phases that these depend on. A phase that is reached only through an `upstream`
   * dependency has operations only for the projects that other projects depend on.
   */
  public getEnginePhaseNames(): IEnginePhaseNames {
    const selected: ReadonlySet<IPhase> = this.#includePhaseDeps?.value
      ? this.#originalPhases
      : this.#initialPhases;
    const complete: Set<IPhase> = new Set(selected);
    for (const phase of complete) {
      for (const dependency of phase.dependencies.self) {
        complete.add(dependency);
      }
    }
    const getNames = (phases: Iterable<IPhase>): ReadonlySet<string> =>
      new Set(Array.from(phases, (phase: IPhase) => phase.name));
    return {
      complete: getNames(complete),
      selected: getNames(selected),
      reachable: getNames(this.#initialPhases)
    };
  }

  /**
   * The settings of this command that shape the operations of the specified phases or the graph that contains them,
   * as JSON. An engine created by one command can serve a request of another command only if both commands have the
   * same graph identity for the phases that the request can run.
   *
   * @remarks
   * It includes the global parameters, the arguments that the custom parameters associated with each phase add to
   * the phase's commands (and therefore to the hashes of its operations), the built-in parameters that are set,
   * other than selection, request-scoped and `ENGINE_SHAREABLE_PARAMETER_NAMES` parameters, and the command's
   * build cache and oversubscription settings. Unlike `getEngineParameterIdentity`, it excludes the command name
   * and whether the command is incremental, which each request applies to its own iteration.
   */
  public getEngineGraphIdentity(phaseNames: ReadonlySet<string>): string {
    const phaseArguments: [string, string[]][] = [];
    for (const phaseName of Array.from(phaseNames).sort()) {
      const phaseArgumentList: string[] = [];
      for (const parameter of this.#phases.get(phaseName)?.associatedParameters ?? []) {
        parameter.appendToArgList(phaseArgumentList);
      }
      phaseArguments.push([phaseName, phaseArgumentList]);
    }
    return JSON.stringify({
      global: this.parser.getParameterStringMap(),
      phases: phaseArguments,
      builtIn: this.#getEngineGraphBuiltInParameters(),
      disableBuildCache: this.#disableBuildCache,
      allowOversubscription: this.#allowOversubscription
    });
  }

  /**
   * The contents of `getEngineGraphIdentity` for the specified phases, keyed by what each describes, so that the
   * parameters and settings that differ between two commands can be named: `--name for "phase"` for the arguments
   * that a phase's parameter adds, the name of a global or built-in parameter, or `name in command-line.json`.
   */
  public getEngineGraphIdentityParts(phaseNames: ReadonlySet<string>): ReadonlyMap<string, string> {
    const parts: Map<string, string> = new Map(Object.entries(this.parser.getParameterStringMap()));
    for (const phaseName of phaseNames) {
      for (const parameter of this.#phases.get(phaseName)?.associatedParameters ?? []) {
        const argumentList: string[] = [];
        parameter.appendToArgList(argumentList);
        if (argumentList.length > 0) {
          parts.set(`${parameter.longName} for "${phaseName}"`, JSON.stringify(argumentList));
        }
      }
    }
    for (const [name, value] of this.#getEngineGraphBuiltInParameters()) {
      parts.set(name, value);
    }
    parts.set('disableBuildCache in command-line.json', String(this.#disableBuildCache));
    parts.set('allowOversubscription in command-line.json', String(this.#allowOversubscription));
    return parts;
  }

  /**
   * The arguments of the custom parameters of this command that are associated with none of the specified phases,
   * as JSON. They cannot affect the operations of these phases, but a plugin that is initialized for this command can
   * read them, so an engine serves another request of the same command only if they are equal.
   */
  public getEngineCustomParameterIdentity(phaseNames: ReadonlySet<string>): string {
    const argumentList: string[] = [];
    for (const parameter of this.#getCustomParametersOfNoPhase(phaseNames)) {
      parameter.appendToArgList(argumentList);
    }
    return JSON.stringify(argumentList);
  }

  /** The arguments in `getEngineCustomParameterIdentity`, keyed by the name of the parameter that adds them. */
  public getEngineCustomParameterIdentityParts(phaseNames: ReadonlySet<string>): ReadonlyMap<string, string> {
    const parts: Map<string, string> = new Map();
    for (const parameter of this.#getCustomParametersOfNoPhase(phaseNames)) {
      const argumentList: string[] = [];
      parameter.appendToArgList(argumentList);
      if (argumentList.length > 0) {
        parts.set(parameter.longName, JSON.stringify(argumentList));
      }
    }
    return parts;
  }

  /** The set built-in parameters that shape the graph: not selection, request-scoped or shareable ones. */
  #getEngineGraphBuiltInParameters(): [string, string][] {
    const excludedNames: Set<string> = new Set([
      ...this.#selectionParameters.parameterNames,
      ...ENGINE_REQUEST_SCOPED_PARAMETER_NAMES,
      ...ENGINE_SHAREABLE_PARAMETER_NAMES
    ]);
    for (const parameter of this.customParameters.values()) {
      excludedNames.add(parameter.scopedLongName ?? parameter.longName);
    }
    return Object.entries(this.getParameterStringMap()).filter(
      ([name, value]) => !excludedNames.has(name) && isParameterValueSet(value)
    );
  }

  #getCustomParametersOfNoPhase(phaseNames: ReadonlySet<string>): CommandLineParameter[] {
    return Array.from(this.customParameters)
      .filter(
        ([parameterJson]) =>
          !parameterJson.associatedPhases?.some((phaseName: string) => phaseNames.has(phaseName))
      )
      .map(([, parameter]) => parameter);
  }

  /**
   * Output verbosity and scheduling settings for one engine request. These are excluded from
   * `getEngineParameterIdentity` and must be applied to the shared graph before each iteration.
   */
  public getEngineRequestSettings(): IPhasedCommandEngineRequestSettings {
    return {
      quietMode: !this.#verboseParameter.value,
      parallelism: this.#getParallelism(),
      isIncrementalBuildAllowed: this.#isIncrementalBuildAllowed
    };
  }

  /**
   * The `--parallelism` value, else the `RUSH_PARALLELISM` default, or 1 if the command does not run in parallel.
   * An engine parser takes the default from the request's environment, because the host process belongs to no
   * request; on Windows its name is matched case-insensitively, like `process.env`.
   */
  #getParallelism(): Parallelism {
    if (!this.#enableParallelism) return 1;
    const engineEnvironment: Readonly<Record<string, string | undefined>> | undefined =
      this.#engineEnvironment;
    let value: string | undefined = this.#parallelismParameter?.value;
    if (value === undefined && engineEnvironment) {
      const name: string = EnvironmentVariableNames.RUSH_PARALLELISM;
      const key: string | undefined =
        process.platform === 'win32'
          ? Object.keys(engineEnvironment).find((candidate: string) => candidate.toUpperCase() === name)
          : name;
      value = key === undefined ? undefined : engineEnvironment[key];
    }
    return parseParallelism(value);
  }

  public async selectEngineOperationsAsync(
    graph: IOperationGraph
  ): Promise<ReadonlyMap<Operation, OperationEnabledState>> {
    const gitOptions: IGitSelectorParserOptions = {
      includeExternalDependencies: true,
      enableFiltering: true,
      getIncrementalBuildIgnoredGlobsAsync: async (project) => {
        const configurations: ReadonlyMap<RushConfigurationProject, RushProjectConfiguration> =
          await RushProjectConfiguration._tryLoadForProjectsUncachedAsync([project], this.#terminal);
        return configurations.get(project)?.incrementalBuildIgnoredGlobs;
      }
    };
    const projects: Set<RushConfigurationProject> = await this.#selectionParameters.getSelectedProjectsAsync(
      this.#terminal,
      undefined,
      gitOptions
    );
    const includePhaseDeps: boolean = !!this.#includePhaseDeps?.value;
    const phases: Set<string> = new Set(
      Array.from(includePhaseDeps ? this.#originalPhases : this.#initialPhases, (phase) => phase.name)
    );
    const selected: Map<Operation, OperationEnabledState> = new Map();
    for (const operation of graph.operations) {
      if (projects.has(operation.associatedProject) && phases.has(operation.associatedPhase.name)) {
        selected.set(operation, true);
      }
    }
    if (includePhaseDeps) {
      for (const operation of selected.keys()) {
        for (const dependency of operation.dependencies) selected.set(dependency, true);
      }
    }
    if (this.#changedProjectsOnlyParameter?.value) {
      for (const operation of selected.keys()) {
        if (!operation.settings?.ignoreChangedProjectsOnlyFlag) {
          selected.set(operation, 'ignore-dependency-changes');
        }
      }
    }
    return selected;
  }

  /** The command-scoped fields of this command's phased telemetry entries. */
  public getTelemetryFields(): IPhasedCommandTelemetryFields {
    const changedProjectsOnlyParameter: CommandLineFlagParameter | undefined =
      this.#changedProjectsOnlyParameter;
    return {
      changedProjectsOnlyKey:
        changedProjectsOnlyParameter?.scopedLongName ?? changedProjectsOnlyParameter?.longName,
      changedProjectsOnly: !!changedProjectsOnlyParameter?.value,
      initialExtraData: {
        // Fields preserved across the command invocation
        ...this.#selectionParameters.getTelemetry(),
        ...this.getParameterStringMap()
      },
      nameForLog: this.actionName
    };
  }

  public async createEngineAsync(): Promise<IPhasedCommandEngine> {
    this.validateEngineCommand();
    await this.initializePluginsAsync();
    let engine: IPhasedCommandEngine | undefined;
    await this.#runAsync((result) => {
      engine = result;
    });
    if (!engine) throw new Error('Native command preparation did not produce an operation graph.');
    return engine;
  }

  async #runAsync(onEngine?: (engine: IPhasedCommandEngine) => void): Promise<void> {
    // Initialize the stopwatch's start time at 0 (process startup).
    const stopwatch: Stopwatch = Stopwatch.start(0);

    const { defaultSubspace } = this.rushConfiguration;
    if (this.#alwaysInstall || this.#installParameter?.value) {
      await measureAsyncFn(`${PERF_PREFIX}:install`, async () => {
        const { doBasicInstallAsync } = await import(
          /* webpackChunkName: 'doBasicInstallAsync' */
          '../../logic/installManager/doBasicInstallAsync'
        );

        const variant: string | undefined = await getVariantAsync(
          this.#variantParameter,
          this.rushConfiguration,
          true
        );
        await doBasicInstallAsync({
          terminal: this.#terminal,
          rushConfiguration: this.rushConfiguration,
          rushGlobalFolder: this.rushGlobalFolder,
          isDebug: this.parser.isDebug,
          variant,
          beforeInstallAsync: (subspace: Subspace) =>
            this.rushSession.hooks.beforeInstall.promise(this, subspace, variant),
          afterInstallAsync: (subspace: Subspace) =>
            this.rushSession.hooks.afterInstall.promise(this, subspace, variant),
          // Eventually we may want to allow a subspace to be selected here
          subspace: defaultSubspace
        });
      });
    }

    await this.#validateInstallStateAsync();

    measureFn(`${PERF_PREFIX}:doBeforeTask`, () => this.#doBeforeTask());

    const hooks: PhasedCommandHooks = this.hooks;
    const terminal: ITerminal = this.#terminal;
    const presentationTerminal: ITerminal =
      onEngine || _isRushSessionOperationStreamEnabled(this.rushSession)
        ? new Terminal(new NoOpTerminalProvider())
        : terminal;

    // if this is parallelizable, then use the value from the flag (undefined or a number),
    // if parallelism is not enabled, then restrict to 1 core
    const maxParallelism: number = getNumberOfCores();
    const parallelism: Parallelism = this.#getParallelism();

    await measureAsyncFn(`${PERF_PREFIX}:applyStandardPlugins`, async () => {
      // Generates the default operation graph
      new PhasedOperationPlugin().apply(hooks);
      // Splices in sharded phases to the operation graph.
      new ShardedPhasedOperationPlugin().apply(hooks);
      // Applies the Shell Operation Runner to selected operations
      new ShellOperationRunnerPlugin().apply(hooks);
      // Verifies correctness of rush-project.json entries for the graph
      new ValidateOperationsPlugin(terminal).apply(hooks);

      if (
        this.rushConfiguration.experimentsConfiguration.configuration
          .trimRushEnvironmentVariablesForOperations
      ) {
        // Trim RUSH_-prefixed environment variables before forwarding to operation processes
        new TrimRushEnvironmentVariablesPlugin().apply(hooks);
      }

      // Forward ignored parameters to child processes as an environment variable
      new IgnoredParametersPlugin().apply(hooks);

      const showTimeline: boolean = this.#timelineParameter?.value ?? false;
      if (showTimeline) {
        const { ConsoleTimelinePlugin } = await import(
          /* webpackChunkName: 'ConsoleTimelinePlugin' */
          '../../logic/operations/ConsoleTimelinePlugin'
        );
        new ConsoleTimelinePlugin(presentationTerminal).apply(this.hooks);
      }

      const diagnosticDir: string | undefined = this.#nodeDiagnosticDirParameter.value;
      if (diagnosticDir) {
        new NodeDiagnosticDirPlugin({
          diagnosticDir
        }).apply(this.hooks);
      }

      // Enable the standard summary
      new OperationResultSummarizerPlugin(presentationTerminal).apply(this.hooks);
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

    const isQuietMode: boolean = !this.#verboseParameter.value;

    const changedProjectsOnly: boolean = !!this.#changedProjectsOnlyParameter?.value;

    let buildCacheConfiguration: BuildCacheConfiguration | undefined;
    let cobuildConfiguration: CobuildConfiguration | undefined;
    if (!this.#disableBuildCache) {
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

    const isWatch: boolean = this.#watchParameter?.value || this.#alwaysWatch;
    const generateFullGraph: boolean = !!onEngine || (isWatch && this.#includeAllProjectsInWatchGraph);
    let transferredEngine: boolean = false;
    let ownedGraph: OperationGraph | undefined;
    let stopOnClosedOutput: (() => void) | undefined;

    try {
      const projectSelection: Set<RushConfigurationProject> = await measureAsyncFn(
        `${PERF_PREFIX}:getSelectedProjects`,
        () =>
          onEngine
            ? Promise.resolve(new Set(this.rushConfiguration.projects))
            : this.#selectionParameters.getSelectedProjectsAsync(terminal, generateFullGraph)
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
        if (
          onEngine &&
          this.rushConfiguration.daemon.usePersistentIpcRunners &&
          !this.#noIPCParameter?.value
        ) {
          const { DaemonIpcOperationRunnerPlugin } = await import(
            /* webpackChunkName: 'DaemonIpcOperationRunnerPlugin' */ '../../logic/operations/DaemonIpcOperationRunnerPlugin'
          );
          new DaemonIpcOperationRunnerPlugin().apply(this.hooks);
        }
        if (
          onEngine &&
          this.#isIncrementalBuildAllowed &&
          this.rushConfiguration.daemon.incrementalBuilds &&
          !cobuildConfiguration?.cobuildFeatureEnabled
        ) {
          const { IncrementalExecutionGuardPlugin } = await import(
            /* webpackChunkName: 'IncrementalExecutionGuardPlugin' */ '../../logic/operations/IncrementalExecutionGuardPlugin'
          );
          new IncrementalExecutionGuardPlugin().apply(this.hooks);
          if (this.rushConfiguration.daemon.warmWorkers && !this.#noIPCParameter?.value) {
            // Applied after DaemonIpcOperationRunnerPlugin, so that an explicit IPC tool keeps its runner.
            const { DaemonWarmWorkerPlugin } = await import(
              /* webpackChunkName: 'DaemonWarmWorkerPlugin' */ '../../logic/operations/DaemonWarmWorkerPlugin'
            );
            new DaemonWarmWorkerPlugin().apply(this.hooks);
          }
        }
        if (isWatch && this.#noIPCParameter?.value === false) {
          new (
            await import(
              /* webpackChunkName: 'IPCOperationRunnerPlugin' */ '../../logic/operations/IPCOperationRunnerPlugin'
            )
          ).IPCOperationRunnerPlugin().apply(this.hooks);
        }

        const {
          experimentsConfiguration: {
            configuration: {
              buildCacheWithAllowWarningsInSuccessfulBuild = false,
              buildSkipWithAllowWarningsInSuccessfulBuild,
              omitAppleDoubleFilesFromBuildCache: excludeAppleDoubleFiles = false,
              useDirectFileTransfersForBuildCache = false,
              usePnpmSyncForInjectedDependencies
            }
          },
          isPnpm
        } = this.rushConfiguration;
        if (buildCacheConfiguration?.buildCacheEnabled || this.#disableBuildCache) {
          // These strategies change outputs without updating the records of legacy skip detection, which a
          // later command without the build cache would otherwise trust.
          new LegacySkipInvalidationPlugin().apply(this.hooks);
        }
        if (buildCacheConfiguration?.buildCacheEnabled) {
          terminal.writeVerboseLine(`Incremental strategy: cache restoration`);
          new CacheableOperationPlugin({
            allowWarningsInSuccessfulBuild: buildCacheWithAllowWarningsInSuccessfulBuild,
            buildCacheConfiguration,
            cobuildConfiguration,
            terminal,
            excludeAppleDoubleFiles,
            useDirectFileTransfersForBuildCache
          }).apply(this.hooks);

          if (this.#debugBuildCacheIdsParameter.value) {
            new DebugHashesPlugin(terminal).apply(this.hooks);
          }
        } else if (!this.#disableBuildCache) {
          terminal.writeVerboseLine(`Incremental strategy: output preservation`);
          // Explicitly disabling the build cache also disables legacy skip detection.
          new LegacySkipPlugin({
            allowWarningsInSuccessfulBuild: buildSkipWithAllowWarningsInSuccessfulBuild,
            terminal,
            changedProjectsOnly,
            isIncrementalBuildAllowed: this.#isIncrementalBuildAllowed
          }).apply(this.hooks);
        } else {
          terminal.writeVerboseLine(`Incremental strategy: none (full rebuild)`);
        }

        const showBuildPlan: boolean = this.#cobuildPlanParameter?.value ?? false;

        if (showBuildPlan) {
          if (!buildCacheConfiguration?.buildCacheEnabled) {
            throw new Error('You must have build cache enabled to use this option.');
          }

          const { BuildPlanPlugin } = await import('../../logic/operations/BuildPlanPlugin');
          new BuildPlanPlugin(terminal).apply(this.hooks);
        }

        if (isPnpm && usePnpmSyncForInjectedDependencies) {
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
            onEngine
              ? this.#loadEngineProjectConfigurationsAsync(relevantProjects, terminal)
              : RushProjectConfiguration.tryLoadForProjectsAsync(relevantProjects, terminal)
          );
      const projectConfigurationIdentity: string | undefined = onEngine
        ? await getProjectConfigurationIdentityAsync(
            projectConfigurations,
            this.rushConfiguration.daemon.usePersistentIpcRunners
          )
        : undefined;

      const includePhaseDeps: boolean = this.#includePhaseDeps?.value ?? false;

      const createOperationsContext: ICreateOperationsContext = {
        buildCacheConfiguration,
        cobuildConfiguration,
        customParameters: customParametersByName,
        changedProjectsOnly,
        includePhaseDeps,
        isIncrementalBuildAllowed: this.#isIncrementalBuildAllowed,
        isWatch,
        rushConfiguration: this.rushConfiguration,
        parallelism,
        phaseSelection: isWatch
          ? this.#watchPhases
          : includePhaseDeps
            ? this.#originalPhases
            : this.#initialPhases,
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
          presentationTerminal.write('Analyzing repo state... ');
          const repoStateStopwatch: Stopwatch = new Stopwatch();
          repoStateStopwatch.start();

          const analyzer: ProjectChangeAnalyzer = new ProjectChangeAnalyzer(this.rushConfiguration);
          const innerGetInputsSnapshotAsync: GetInputsSnapshotAsyncFn | undefined =
            await analyzer._tryGetSnapshotProviderAsync(
              projectConfigurations,
              terminal,
              // We need to include all dependencies, otherwise build cache id calculation will be incorrect
              relevantProjects,
              {
                // An engine cannot continue without a snapshot, so it reports why none could be taken.
                throwOnMissingProjectShrinkwrapFile: !!onEngine,
                // An engine takes a snapshot for each request
                reuseUnchangedInputs: !!onEngine
              }
            );
          const innerInitialSnapshot: IInputsSnapshot | undefined = innerGetInputsSnapshotAsync
            ? await innerGetInputsSnapshotAsync()
            : undefined;

          repoStateStopwatch.stop();
          presentationTerminal.writeLine(`DONE (${repoStateStopwatch.toString()})`);
          presentationTerminal.writeLine();
          return [innerGetInputsSnapshotAsync, innerInitialSnapshot];
        }
      );

      let executionTelemetryHandler: IOperationGraphTelemetry | undefined;
      const { telemetry: parserTelemetry } = this.parser;
      if (parserTelemetry) {
        const { changedProjectsOnlyKey, initialExtraData, nameForLog } = this.getTelemetryFields();
        executionTelemetryHandler = {
          changedProjectsOnlyKey,
          initialExtraData,
          nameForLog,
          log: (logEntry: ITelemetryData) => {
            parserTelemetry.log(logEntry);
            parserTelemetry.flush();
          }
        };
      }

      const getGraphInputsSnapshotAsync: GetInputsSnapshotAsyncFn | undefined =
        onEngine && getInputsSnapshotAsync
          ? () =>
              // Git reads the repository state while the configuration is checked
              runDuringChecksAsync(getInputsSnapshotAsync, async () => {
                await this.#validateInstallStateAsync();
                const currentConfigurations: ReadonlyMap<
                  RushConfigurationProject,
                  RushProjectConfiguration
                > = await this.#loadEngineProjectConfigurationsAsync(relevantProjects, terminal);
                if (
                  (await getProjectConfigurationIdentityAsync(
                    currentConfigurations,
                    this.rushConfiguration.daemon.usePersistentIpcRunners
                  )) !== projectConfigurationIdentity
                ) {
                  throw new PhasedCommandEngineConfigurationChangedError();
                }
              })
          : getInputsSnapshotAsync;
      const graphOptions: IOperationGraphOptions = {
        quietMode: isQuietMode,
        debugMode: this.parser.isDebug,
        destinations: [
          onEngine || _isRushSessionOperationStreamEnabled(this.rushSession)
            ? new CallbackWritable({ onWriteChunk: () => undefined })
            : StdioWritable.instance
        ],
        parallelism,
        maxParallelism,
        allowOversubscription: this.#allowOversubscription,
        isWatch,
        pauseNextIteration: !!onEngine,
        getInputsSnapshotAsync: getGraphInputsSnapshotAsync,
        abortController: this.sessionAbortController,
        closeRunnersOnAbort: !onEngine,
        supportsTerminateRunning: !!onEngine,
        telemetry: executionTelemetryHandler
      };

      const graph: OperationGraph = new OperationGraph(operations, graphOptions);
      ownedGraph = graph;
      if (onEngine) {
        // BaseRushAction prepends the repository bin directory by mutating PATH. Engine hosts
        // instead supply that same prefix only to operation environments, before plugin transforms.
        graph.hooks.createEnvironmentForOperation.tap(
          { name: 'PhasedCommandEngine', stage: -Infinity },
          (environment) => {
            const result: EnvironmentMap = new EnvironmentMap(environment);
            result.set(
              'PATH',
              `${path.join(this.rushConfiguration.commonTempFolder, 'node_modules', '.bin')}${path.delimiter}${result.get('PATH') ?? ''}`
            );
            return result.toObject();
          }
        );
      } else {
        // A native command makes one request for each iteration. An engine host invokes this hook itself, once for
        // each request that it serves.
        graph.hooks.afterExecuteIterationAsync.tapPromise(
          { name: 'PhasedScriptAction', stage: Infinity },
          async (
            status: OperationStatus,
            operationResults: ReadonlyMap<Operation, IOperationExecutionResult>
          ): Promise<OperationStatus> => {
            if (graph.hooks.afterExecuteRequestAsync.isUsed()) {
              await graph.hooks.afterExecuteRequestAsync.promise({
                commandName: this.actionName,
                environment: process.env,
                operationResults,
                requestId: undefined,
                status,
                terminal
              });
            }
            return status;
          }
        );
      }

      const graphContext: IOperationGraphContext = {
        ...createOperationsContext,
        initialSnapshot
      };

      await measureAsyncFn(`${PERF_PREFIX}:executionManager`, async () => {
        await hooks.onGraphCreatedAsync.promise(graph, graphContext);
      });
      if (onEngine) {
        if (!getGraphInputsSnapshotAsync || !initialSnapshot) {
          throw new Error('The daemon engine requires a Git-backed workspace inputs snapshot.');
        }
        let disposePromise: Promise<void> | undefined;
        onEngine({
          operationGraph: graph,
          rushSession: this.rushSession,
          inputsSnapshot: initialSnapshot,
          getInputsSnapshotAsync: getGraphInputsSnapshotAsync,
          isIncremental: this.#isIncrementalBuildAllowed,
          phaseNames: Array.from(new Set(Array.from(operations, (op) => op.associatedPhase.name))).sort(),
          pluginNames: Array.from(
            new Set([
              ...this.parser.pluginManager.loadedPluginNames,
              ...hooks.createOperationsAsync.taps.map((tap) => tap.name),
              ...hooks.onGraphCreatedAsync.taps.map((tap) => tap.name)
            ])
          ).sort(),
          [Symbol.asyncDispose]: () =>
            (disposePromise ??= disposeEngineGraphAsync(graph, cobuildConfiguration))
        });
        transferredEngine = true;
        return;
      }

      const abortPromise: Promise<void> = once(this.sessionAbortController.signal, 'abort').then(async () => {
        terminal.writeLine(`Shutting down Rush...`);
        return await graph.abortCurrentIterationAsync();
      });
      // After abortPromise listens, because a reader that already exited aborts the session at once.
      stopOnClosedOutput = this.#stopOnClosedOutput(graph);
      attachReporterOperationEventSink(graph, this.rushSession, this.actionName, isWatch);

      const executeOptions: IExecuteOperationsOptions = {
        graph,
        ignoreHooks: !!this.#ignoreHooksParameter.value,
        isWatch,
        stopwatch,
        terminal: presentationTerminal
      };

      const initialIterationOptions: IOperationGraphIterationOptions = {
        inputsSnapshot: initialSnapshot
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
          getInputsSnapshotAsync,
          terminal: presentationTerminal,
          debounceMs: this.#watchDebounceMs,
          renderStatusInPlace: !_isRushSessionOperationStreamEnabled(this.rushSession)
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
            this.#executeOperationsAsync(executeOptions, initialIterationOptions)
          )
        );
      }
    } finally {
      // A reader that exits after the command's operations have settled cancels nothing; the exit code still says so.
      stopOnClosedOutput?.();
      if (onEngine && !transferredEngine && ownedGraph) {
        await disposeEngineGraphAsync(ownedGraph, cobuildConfiguration);
      } else if (cobuildConfiguration && !transferredEngine) {
        await cobuildConfiguration.destroyLockProviderAsync();
      }
    }
  }

  /**
   * When the process reading the CLI's stdout or stderr exits, for example `head` in `rush build | head -5`, stops
   * starting operations, as aborting the session does, and says so once on stderr. Operations that already started
   * finish first: a native command does not start them in their own process groups, so it cannot stop their
   * process trees. Returns a function that stops listening, or undefined when the parser does not report closures.
   */
  #stopOnClosedOutput(graph: OperationGraph): (() => void) | undefined {
    const standardOutputClosure: StandardOutputClosure | undefined = this.parser.standardOutputClosure;
    if (!standardOutputClosure) {
      return undefined;
    }

    let closedOutput: IClosedStandardOutput | undefined;
    let iterationRecords: ReadonlyMap<Operation, IOperationExecutionResult> | undefined;
    graph.hooks.beforeExecuteIterationAsync.tap(
      { name: 'StandardOutputClosure', stage: -Infinity },
      (records: ReadonlyMap<Operation, IOperationExecutionResult>): OperationStatus | undefined => {
        iterationRecords = records;
        // The reader exited before this iteration started, possibly while it was being scheduled: run nothing.
        return closedOutput ? OperationStatus.Aborted : undefined;
      }
    );

    return standardOutputClosure.onClosed((closed: IClosedStandardOutput) => {
      if (closedOutput) {
        return;
      }
      closedOutput = closed;
      let operationsRunning: boolean = false;
      for (const record of iterationRecords?.values() ?? []) {
        if (record.status === OperationStatus.Executing) {
          operationsRunning = true;
          break;
        }
      }
      // Directly to stderr: the terminal may write to the closed stdout, for example through a reporter.
      process.stderr.write(formatClosedOutputNotice(this.actionName, closed, operationsRunning));
      this.sessionAbortController.abort();
    });
  }

  /**
   * Runs a set of operations and reports the results.
   */
  async #executeOperationsAsync(
    options: IExecuteOperationsOptions,
    iterationOptions: IOperationGraphIterationOptions
  ): Promise<void> {
    const { graph, ignoreHooks, stopwatch, terminal } = options;

    let success: boolean = false;

    try {
      const definiteResult: IExecutionResult = await measureAsyncFn(
        `${PERF_PREFIX}:executeOperationsInner`,
        async () => {
          return await graph.executeAsync(iterationOptions);
        }
      );
      success = SUCCESSFUL_EXECUTION_STATUSES.has(definiteResult.status);

      stopwatch.stop();

      const message: string = `rush ${this.actionName} (${stopwatch.toString()})`;
      if (success) {
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
      measureFn(`${PERF_PREFIX}:doAfterTask`, () => this.#doAfterTask());
    }

    if (!success) {
      throw new AlreadyReportedError();
    }
  }

  /**
   * Loads the configuration of every specified project for an engine, which loads projects that a native
   * command might not select.
   */
  async #loadEngineProjectConfigurationsAsync(
    projects: ReadonlySet<RushConfigurationProject>,
    terminal: ITerminal
  ): Promise<ReadonlyMap<RushConfigurationProject, RushProjectConfiguration>> {
    try {
      return await RushProjectConfiguration._tryLoadForProjectsUncachedAsync(projects, terminal);
    } catch (error) {
      // An incomplete install can leave both a project dependency file and a rig package missing. Without the
      // file, native Rush cannot analyze the repo state either, so report it: "rush install" fixes both.
      throw (await tryGetMissingProjectShrinkwrapFileErrorAsync(this.rushConfiguration)) ?? error;
    }
  }

  async #validateInstallStateAsync(): Promise<void> {
    if (!this._runsBeforeInstall) {
      await measureAsyncFn(`${PERF_PREFIX}:checkInstallFlag`, async () => {
        const {
          defaultSubspace,
          subspacesFeatureEnabled,
          pnpmOptions: { useWorkspaces }
        } = this.rushConfiguration;
        // TODO: Replace with last-install.flag when "rush link" and "rush unlink" are removed
        const lastLinkFlag: FlagFile = new FlagFile(
          defaultSubspace.getSubspaceTempFolderPath(),
          RushConstants.lastLinkFlagFilename,
          {}
        );
        if (!(await lastLinkFlag.isValidAsync()) && !subspacesFeatureEnabled) {
          if (useWorkspaces) {
            throw new Error('Link flag invalid.\nDid you run "rush install" or "rush update"?');
          } else {
            throw new Error('Link flag invalid.\nDid you run "rush link"?');
          }
        }
      });
    }
  }

  #doBeforeTask(): void {
    if (!this.#runsBuildEventHooks()) {
      // Only collects information for built-in commands like build or rebuild.
      return;
    }

    SetupChecks.validate(this.rushConfiguration);

    this.eventHooksManager.handle(Event.preRushBuild, this.parser.isDebug, this.#ignoreHooksParameter.value);
  }

  #doAfterTask(): void {
    if (!this.#runsBuildEventHooks()) {
      // Only collects information for built-in commands like build or rebuild.
      return;
    }
    this.eventHooksManager.handle(Event.postRushBuild, this.parser.isDebug, this.#ignoreHooksParameter.value);
  }

  /** Whether this command runs the preRushBuild/postRushBuild event hooks, which only build and rebuild do. */
  #runsBuildEventHooks(): boolean {
    return (
      this.actionName === RushConstants.buildCommandName ||
      this.actionName === RushConstants.rebuildCommandName
    );
  }
}

/** `getParameterStringMap` maps an unset flag to "false", an unset list to "" and other unset values to undefined. */
function isParameterValueSet(value: string | undefined): boolean {
  return value !== undefined && value !== 'false' && value !== '';
}

async function getProjectConfigurationIdentityAsync(
  configurations: ReadonlyMap<RushConfigurationProject, RushProjectConfiguration>,
  persistentIpc: boolean
): Promise<string> {
  return JSON.stringify([
    await getDaemonIpcImplementationIdentityAsync(configurations, persistentIpc),
    Array.from(configurations, ([project, configuration]) => ({
      project: project.packageName,
      incrementalBuildIgnoredGlobs: configuration.incrementalBuildIgnoredGlobs,
      disableBuildCacheForProject: configuration.disableBuildCacheForProject,
      operations: Array.from(configuration.operationSettingsByOperationName).sort(([left], [right]) =>
        Sort.compareByValue(left, right)
      )
    })).sort((left, right) => Sort.compareByValue(left.project, right.project))
  ]);
}

async function disposeEngineGraphAsync(
  graph: OperationGraph,
  cobuildConfiguration: CobuildConfiguration | undefined
): Promise<void> {
  graph.abortController.abort();
  const errors: unknown[] = [];
  for (const cleanupAsync of [
    () => graph.abortCurrentIterationAsync({ terminateRunning: true }),
    () => graph.closeRunnersAsync(),
    async () => {
      await cobuildConfiguration?.destroyLockProviderAsync();
    }
  ]) {
    try {
      await cleanupAsync();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length === 1) {
    throw errors[0];
  }
  if (errors.length > 1) {
    throw new AggregateError(errors, 'Failed to dispose native phased engine resources.');
  }
}
