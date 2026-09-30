// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import type { PerformanceEntry } from 'node:perf_hooks';

import { FileSystem, LockFile } from '@rushstack/node-core-library';
import { Terminal, type ITerminalProvider } from '@rushstack/terminal';
import type { CommandLineAction } from '@rushstack/ts-command-line';
// The package does not export the error that its parsers throw for an invalid command line.
import { CommandLineParserExitError } from '@rushstack/ts-command-line/lib/providers/CommandLineParserExitError';

import { RushCommandLineParser } from '../cli/RushCommandLineParser';
import { PhasedScriptAction, type IEnginePhaseNames } from '../cli/scriptActions/PhasedScriptAction';
import type { GetInputsSnapshotAsyncFn, IInputsSnapshot } from '../logic/incremental/InputsSnapshot';
import type { IOperationGraph } from '../logic/operations/IOperationGraph';
import type { Operation, OperationEnabledState } from '../logic/operations/Operation';
import type { OperationStatus } from '../logic/operations/OperationStatus';
import type { Parallelism } from '../logic/operations/ParseParallelism';
import { PhasedCommandEngineExecution } from '../logic/operations/PhasedCommandEngineExecution';
import { createPhasedTelemetryData } from '../logic/operations/PhasedCommandTelemetry';
import { type ITelemetryData, Telemetry } from '../logic/Telemetry';
import { getRunAnyPhasedCommandBlocker } from '../pluginFramework/PhasedCommandHookTaps';
import type { OperationGraphHooks } from '../pluginFramework/OperationGraphHooks';
import type { RushSession } from '../pluginFramework/RushSession';
import type { RushConfiguration } from './RushConfiguration';
import { RushUserConfiguration } from './RushUserConfiguration';
import { PhasedCommandEngineBusyError } from './PhasedCommandEngineBusyError';
import { PhasedCommandEngineUsageError } from './PhasedCommandEngineUsageError';
import { resolvePhasedCommandCwdAsync } from '../utilities/resolvePhasedCommandCwd';

/** How long disposing an engine waits for `flushTelemetry` taps that are still running. */
const TELEMETRY_FLUSH_WAIT_MS: number = 2000;

/**
 * A native phased command graph prepared without executing an iteration.
 * @alpha
 */
export interface IPhasedCommandEngine extends AsyncDisposable {
  [Symbol.asyncDispose](): Promise<void>;
  /** Acquire once per coalesced iteration, before input reconciliation; dispose after output and runner cleanup. */
  readonly acquireExecutionLeaseAsync?: () => Promise<AsyncDisposable>;
  readonly operationGraph: IOperationGraph;
  readonly rushSession: RushSession;
  readonly inputsSnapshot: IInputsSnapshot;
  readonly getInputsSnapshotAsync: GetInputsSnapshotAsyncFn;
  readonly phaseNames: ReadonlyArray<string>;
  readonly pluginNames: ReadonlyArray<string>;
  readonly isIncremental: boolean;
  /**
   * Logs one request's telemetry entry the way a native iteration logs its own: `beforeLogRequest` and `beforeLog`
   * taps run first, then the entry is saved under `common/temp/telemetry` and passed to `flushTelemetry` taps.
   * Disposing the engine waits up to 2 seconds for taps that are still running; a tap that takes longer, such as an
   * upload over a stalled network, keeps running in the background, so that it cannot hold the host. Saving does
   * nothing when telemetry is disabled for the repository.
   *
   * @remarks
   * `beforeLog` taps describe the latest iteration, so a host logs an iteration's entries before it starts the
   * next iteration.
   */
  readonly logTelemetry?: (data: ITelemetryData, options?: IPhasedCommandEngineLogTelemetryOptions) => void;
}

/**
 * Options for `IPhasedCommandEngine.logTelemetry`.
 * @alpha
 */
export interface IPhasedCommandEngineLogTelemetryOptions {
  /**
   * Whether a graph iteration served the request. If `false`, as for a request that the warm graph answered
   * without an iteration, `beforeLog` taps are skipped, because they would describe an earlier iteration;
   * `beforeLogRequest` taps still run. Defaults to `true`.
   */
  readonly servedByIteration?: boolean;
}

/**
 * One operation's result in a request-scoped telemetry entry.
 * @alpha
 */
export interface IPhasedCommandEngineTelemetryRecord {
  /** The operation's status in this request. */
  readonly status: OperationStatus;
  /** Whether the operation's runner is silent. Silent operations are omitted from the entry. */
  readonly silent: boolean;
  /** `performance.now()` values for when the operation started and ended in this request. */
  readonly stopwatch: { readonly startTime: number | undefined; readonly endTime: number | undefined };
  /** How long the operation would have taken without the build cache. */
  readonly nonCachedDurationMs: number | undefined;
}

/**
 * The results of one request served by a long-lived engine.
 * @alpha
 */
export interface IPhasedCommandEngineTelemetryOptions {
  /** The results of the request's selected operations. Silent operations are omitted from the entry. */
  readonly records: ReadonlyMap<Operation, IPhasedCommandEngineTelemetryRecord>;
  /** Whether the request succeeded. As for a native command, only a `Success` status counts as success. */
  readonly succeeded: boolean;
  /** How long the request's graph iteration took, in seconds. */
  readonly durationInSeconds: number;
  /** A `performance.now()` value. Operation and performance entry times are reported relative to it. */
  readonly timeOriginMs: number;
  /** Host-specific fields, added after the native fields. */
  readonly extraData?: Readonly<Record<string, string | number | boolean>>;
  /** The request's performance entries, with `performance.now()` start times. */
  readonly performanceEntries?: ReadonlyArray<PerformanceEntry>;
}

/** Options for parsing a command for a long-lived engine host. @alpha */
export interface IParsePhasedCommandOptions {
  readonly argv: ReadonlyArray<string>;
  readonly cwd: string;
  /**
   * The environment of the client that sent the command. It supplies the defaults of environment-backed
   * parameters (`RUSH_PARALLELISM`), because a long-lived host's own environment belongs to no request.
   * Defaults to `process.env`.
   */
  readonly environment?: Readonly<Record<string, string | undefined>>;
  readonly rushConfiguration: RushConfiguration;
  readonly terminalProvider: ITerminalProvider;
}

/**
 * Presentation and scheduling settings of one parsed command. They do not affect the operation graph or any
 * operation hash, so they are not part of `PhasedCommandEngine.parameterIdentity`; hosts apply them to the
 * shared graph (`IOperationGraph.quietMode` / `IOperationGraph.parallelism`) and to the iteration before each
 * iteration.
 * @alpha
 */
export interface IPhasedCommandEngineRequestSettings {
  readonly quietMode: boolean;
  readonly parallelism: Parallelism;
  /**
   * False for a command that runs every selected operation, such as `rebuild`. Hosts pass it to the iteration
   * (`IOperationGraphIterationOptions.isIncrementalBuildAllowed`), because an engine created by an incremental
   * command can serve such a command; see `PhasedCommandEngine.getEngineSharingBlocker`.
   */
  readonly isIncrementalBuildAllowed: boolean;
}

/**
 * How the reason that `PhasedCommandEngine.getEngineSharingBlocker` returns names the command that created the engine
 * and the requested command, for example `"build"` or `the earlier "test"`.
 * @alpha
 */
export interface IPhasedCommandEngineSharingLabels {
  /** Names the command that created the engine. */
  readonly engine: string;
  /** Names the requested command. */
  readonly request: string;
}

/**
 * A parsed native phased command, such as build, rebuild or a phased command from command-line.json.
 * Parsing never runs scripts or changes cwd/process.env.
 *
 * @remarks
 * The initial engine surface deliberately rejects watch/install, build event-hook scripts, .env files, and
 * external plugins that Rush would initialize for the command or whose command-line.json shapes it, unless
 * the plugin's manifest (`daemonCompatible`) or the repository (`daemon.compatiblePlugins`) declares that the
 * plugin supports the engine lifecycle. An engine applies each plugin once and serves many requests: session
 * hooks, `createOperationsAsync` (with every project and `isWatch` false) and `onGraphCreatedAsync` run once
 * per engine, operation graph hooks run for each iteration (which can serve several coalesced requests), and
 * disposal aborts `IOperationGraph.abortController` and then closes every operation runner. Plugins associated
 * only with other commands are inert and permitted. Native graph/cache plugins are not replaced.
 * @alpha
 */
export class PhasedCommandEngine {
  private readonly _parser: RushCommandLineParser;
  private readonly _action: PhasedScriptAction;
  private _created: boolean = false;

  public readonly parameterIdentity: string;
  public readonly commandName: string;
  /** False when every run executes all selected operations: `rebuild`, or `"incremental": false`. */
  public readonly isIncremental: boolean;
  /**
   * Names listed by `daemon.compatiblePlugins` (or `RUSH_DAEMON_COMPATIBLE_PLUGINS`) that match no plugin
   * configured in rush-plugins.json. They have no effect and are usually misspellings, so hosts should report them.
   */
  public readonly unmatchedCompatiblePluginNames: ReadonlyArray<string>;

  private constructor(
    parser: RushCommandLineParser,
    action: PhasedScriptAction,
    unmatchedCompatiblePluginNames: ReadonlyArray<string>
  ) {
    this._parser = parser;
    this._action = action;
    this.commandName = action.actionName;
    this.isIncremental = action.isIncrementalBuildAllowed;
    this.parameterIdentity = action.getEngineParameterIdentity();
    this.unmatchedCompatiblePluginNames = unmatchedCompatiblePluginNames;
  }

  /**
   * Parses a native phased command line. Throws a {@link PhasedCommandEngineUsageError} for a command line of a
   * phased command that native Rush rejects as invalid.
   */
  public static async parseAsync(options: IParsePhasedCommandOptions): Promise<PhasedCommandEngine> {
    const { rushConfiguration, terminalProvider, cwd, argv, environment = process.env } = options;
    const resolvedCwd: string = await resolvePhasedCommandCwdAsync(cwd, rushConfiguration.rushJsonFolder);
    if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
      throw new Error('Command help must be handled by the native CLI, not by an engine request.');
    }
    for (const folder of [rushConfiguration.rushJsonFolder, RushUserConfiguration.getRushUserFolderPath()]) {
      if (FileSystem.exists(path.join(folder, '.env'))) {
        throw new Error('Daemon engine execution does not yet support .env initialization. Use --no-daemon.');
      }
    }
    const parser: RushCommandLineParser = new RushCommandLineParser({
      cwd: resolvedCwd,
      engine: { rushConfiguration, terminalProvider, environment }
    });
    try {
      await parser.executeWithoutErrorHandlingAsync([...argv]);
    } catch (error) {
      // Native Rush prints this message and exits with this exit code. It's a usage error only for a phased command,
      // since the daemon serves no other command: in-process Rush reports an unknown or global command itself.
      // Rush's global parameters are all flags, so the first argument that isn't a flag names the command.
      const commandName: string | undefined = argv.find((arg: string) => !arg.startsWith('-'));
      const commandAction: CommandLineAction | undefined =
        commandName === undefined ? undefined : parser.tryGetAction(commandName);
      if (
        error instanceof CommandLineParserExitError &&
        error.exitCode !== 0 &&
        commandAction instanceof PhasedScriptAction
      ) {
        // The parser also wrote the usage to this process's stdout, which the client of a daemon does not see.
        throw new PhasedCommandEngineUsageError(error.message.trim(), error.exitCode, {
          cause: error,
          usage: commandAction.renderUsageText()
        });
      }
      throw error;
    }
    const action: CommandLineAction | undefined = parser.selectedAction;
    if (!(action instanceof PhasedScriptAction)) {
      throw new Error(
        `The daemon engine runs phased commands only; "${action?.actionName ?? argv[0]}" is not a phased command.`
      );
    }
    const compatiblePluginNames: ReadonlySet<string> = new Set(rushConfiguration.daemon.compatiblePlugins);
    const configuredPluginNames: ReadonlySet<string> = parser.pluginManager.configuredPluginNames;
    const terminal: Terminal = new Terminal(terminalProvider);
    const unmatchedCompatiblePluginNames: ReadonlyArray<string> = warnAboutUnmatchedPluginNames(
      terminal,
      configuredPluginNames,
      compatiblePluginNames,
      'compatible plugin list (rush.json "daemon.compatiblePlugins" or RUSH_DAEMON_COMPATIBLE_PLUGINS)'
    );
    warnAboutUnmatchedPluginNames(
      terminal,
      configuredPluginNames,
      new Set(rushConfiguration.daemon.commandAgnosticPlugins),
      'command-agnostic plugin list (rush.json "daemon.commandAgnosticPlugins" or ' +
        'RUSH_DAEMON_COMMAND_AGNOSTIC_PLUGINS)'
    );
    // Plugins which the command would never initialize, and whose command-line.json does not shape
    // this command, cannot affect a shared engine. Every other external plugin must be declared compatible
    // with the engine lifecycle; otherwise the command still requires native Rush.
    const incompatiblePlugins: ReadonlyArray<string> = parser.pluginManager.getPluginsIncompatibleWithEngine(
      action.actionName,
      action.schedulablePhaseNames,
      compatiblePluginNames
    );
    if (incompatiblePlugins.length > 0) {
      throw new Error(
        `Daemon engine execution does not support Rush plugins that participate in "${action.actionName}" ` +
          `unless they are declared daemon-compatible: ${incompatiblePlugins.join('; ')}. A plugin declares this ` +
          `with "daemonCompatible" in its rush-plugin-manifest.json; a repository can list plugins it has ` +
          `verified in the rush.json "daemon.compatiblePlugins" setting or RUSH_DAEMON_COMPATIBLE_PLUGINS. ` +
          `Use --no-daemon.`
      );
    }
    action.validateEngineCommand();
    return new PhasedCommandEngine(parser, action, unmatchedCompatiblePluginNames);
  }

  /**
   * Creates the all-project graph through the native CLI preparation pipeline.
   * Releases the preparation lock before returning. Hosts must acquire an execution lease around each iteration.
   *
   * @param preparationLock - The repository lock that the host already holds. The host keeps it; otherwise the
   * engine takes the lock itself and releases it before returning.
   * @param abortSignal - For a host that prepares an engine before any request needs it. Once the signal aborts, the
   * preparation stops before its next step; a step that has started runs to its end. The partial graph is disposed,
   * the lock is released unless the host lent it, and the promise rejects with the signal's reason. The parsed
   * command cannot create an engine again, unless the signal had already aborted when this was called.
   */
  public async createEngineAsync(
    preparationLock?: LockFile,
    abortSignal?: AbortSignal
  ): Promise<IPhasedCommandEngine> {
    if (this._created) {
      throw new Error('This parsed command has already created its engine.');
    }
    const lockFolder: string = this._parser.rushConfiguration.commonTempFolder;
    if (
      preparationLock &&
      (preparationLock.isReleased ||
        preparationLock.filePath !== LockFile.getLockFilePath(lockFolder, 'rush'))
    ) {
      throw new Error('The borrowed preparation lock is not held for this workspace.');
    }
    abortSignal?.throwIfAborted();
    const lock: LockFile | undefined = preparationLock ?? LockFile.tryAcquire(lockFolder, 'rush');
    if (!lock) throw new PhasedCommandEngineBusyError();
    this._created = true;
    let engine: IPhasedCommandEngine | undefined;
    let releaseAttempted: boolean = false;
    try {
      await this._parser.pluginManager.tryInitializeUnassociatedPluginsAsync();
      engine = await this._action.createEngineAsync(abortSignal);
      if (!preparationLock) {
        releaseAttempted = true;
        lock.release();
      }
      const execution: PhasedCommandEngineExecution = new PhasedCommandEngineExecution(
        engine,
        this._parser.rushConfiguration.commonTempFolder
      );
      const { operationGraph } = engine;
      const telemetry: Telemetry = new Telemetry(this._parser.rushConfiguration, this._parser.rushSession);
      return {
        ...engine,
        acquireExecutionLeaseAsync: () => execution.acquireExecutionLeaseAsync(),
        logTelemetry: (data: ITelemetryData, options?: IPhasedCommandEngineLogTelemetryOptions) =>
          logEngineTelemetry(operationGraph.hooks, telemetry, data, options),
        [Symbol.asyncDispose]: async () => {
          try {
            await execution[Symbol.asyncDispose]();
          } finally {
            await waitForTelemetryFlushAsync(telemetry.ensureFlushedAsync(), TELEMETRY_FLUSH_WAIT_MS);
          }
        }
      };
    } catch (error) {
      const cleanupErrors: unknown[] = [];
      if (engine) {
        try {
          await engine[Symbol.asyncDispose]();
        } catch (cleanupError) {
          cleanupErrors.push(cleanupError);
        }
      }
      if (!preparationLock && !releaseAttempted) {
        try {
          lock.release();
        } catch (cleanupError) {
          cleanupErrors.push(cleanupError);
        }
      }
      if (cleanupErrors.length > 0) {
        throw new AggregateError(
          [error, ...cleanupErrors],
          'Failed to prepare and clean up the native engine.'
        );
      }
      throw error;
    }
  }

  /** Resolves native project/phase selection against an existing, compatible graph. */
  public async selectOperationsAsync(
    graph: IOperationGraph
  ): Promise<ReadonlyMap<Operation, OperationEnabledState>> {
    return await this._action.selectEngineOperationsAsync(graph);
  }

  /** Presentation and scheduling settings requested by this command; not part of `parameterIdentity`. */
  public get requestSettings(): IPhasedCommandEngineRequestSettings {
    return this._action.getEngineRequestSettings();
  }

  /**
   * Explains why the engine created by this command cannot serve a request of `request`, or returns undefined if it
   * can serve it. `rushSession` is the session of an engine created by this command or by `request`.
   *
   * @remarks
   * An engine serves another request of the same command if its graph has the request's operations and the
   * parameters of the two requests are the same, other than the ones that each request applies to its own iteration
   * (selection, `requestSettings`, `--ignore-hooks` and `--include-phase-deps`). An engine created by an incremental
   * command also serves another command, for example `rebuild` on a `build` engine or `build` on a `test` engine,
   * if:
   *
   * - its graph has an operation of every project in each phase that the request selects;
   *
   * - the parameters of both commands give the same arguments to the phases that the request can run;
   *
   * - the same plugins are associated with both commands, and no plugin taps the `runPhasedCommand` hook of either
   *   command. Rush calls this hook and `runAnyPhasedCommand` once per engine, with the command that created it, so
   *   every tap of `runAnyPhasedCommand` must come from the `apply()` of a plugin that is declared command-agnostic:
   *   its manifest sets `daemonCommandAgnostic`, or the repository lists it in `daemon.commandAgnosticPlugins`
   *   (or `RUSH_DAEMON_COMMAND_AGNOSTIC_PLUGINS`).
   *
   * A request of a command that is not incremental runs each operation that it selects
   * (`IPhasedCommandEngineRequestSettings.isIncrementalBuildAllowed`). An engine that runs persistent
   * IPC runners (`daemon.usePersistentIpcRunners`) does not serve it, because those runners serve only
   * incremental commands.
   *
   * If the parameters differ, the reason names each parameter and which command sets it, or that both set it to
   * different values. `labels` names the two commands in the reason. By default, they are the quoted command names,
   * or `the engine's "name"` and `the requested "name"` if both commands have the same name.
   */
  public getEngineSharingBlocker(
    request: PhasedCommandEngine,
    rushSession: RushSession,
    labels?: IPhasedCommandEngineSharingLabels
  ): string | undefined {
    const { commandName } = this;
    const requestName: string = request.commandName;
    const sameCommand: boolean = requestName === commandName;
    const sharingLabels: IPhasedCommandEngineSharingLabels =
      labels ?? getDefaultSharingLabels(commandName, requestName);
    const { engine: engineLabel, request: requestLabel } = sharingLabels;
    if (!sameCommand && !this.isIncremental) {
      return `${engineLabel} is not incremental`;
    }
    if (!request.isIncremental && this._action.usesPersistentIpcRunners) {
      return `${requestLabel} is not incremental, and ${engineLabel} runs persistent IPC runners`;
    }
    const enginePhases: IEnginePhaseNames = this._action.getEnginePhaseNames();
    const requestPhases: IEnginePhaseNames = request._action.getEnginePhaseNames();
    for (const phaseName of requestPhases.selected) {
      if (!enginePhases.complete.has(phaseName)) {
        return `the graph of ${engineLabel} does not have every operation of the "${phaseName}" phase`;
      }
    }
    const { reachable } = requestPhases;
    if (
      this._action.getEngineGraphIdentity(reachable) !== request._action.getEngineGraphIdentity(reachable)
    ) {
      const differences: string = describeDifferences(
        this._action.getEngineGraphIdentityParts(reachable),
        request._action.getEngineGraphIdentityParts(reachable),
        sharingLabels
      );
      return `the parameters of their phases differ${differences}`;
    }
    if (sameCommand) {
      if (
        this._action.getEngineCustomParameterIdentity(reachable) ===
        request._action.getEngineCustomParameterIdentity(reachable)
      ) {
        return undefined;
      }
      const differences: string = describeDifferences(
        this._action.getEngineCustomParameterIdentityParts(reachable),
        request._action.getEngineCustomParameterIdentityParts(reachable),
        sharingLabels
      );
      return `their parameters differ${differences}`;
    }
    let samePlugins: boolean;
    try {
      samePlugins =
        this._parser.pluginManager.getPluginsAssociatedWithCommand(commandName).join('\n') ===
        request._parser.pluginManager.getPluginsAssociatedWithCommand(requestName).join('\n');
    } catch (error) {
      return `a plugin manifest could not be read: ${(error as Error).message}`;
    }
    if (!samePlugins) {
      return `different plugins are associated with ${requestLabel} and ${engineLabel}`;
    }
    const { runAnyPhasedCommand, runPhasedCommand } = rushSession.hooks;
    const runAnyPhasedCommandBlocker: string | undefined = getRunAnyPhasedCommandBlocker(runAnyPhasedCommand);
    if (runAnyPhasedCommandBlocker !== undefined) {
      return runAnyPhasedCommandBlocker;
    }
    for (const name of [commandName, requestName]) {
      if (runPhasedCommand.get(name)?.isUsed()) {
        return `a plugin taps the runPhasedCommand hook of "${name}"`;
      }
    }
    return undefined;
  }

  /**
   * Builds the native telemetry entry for one request that this command made of a long-lived engine.
   *
   * @remarks
   * The entry carries this command's own parameters, not those of the command that created the engine, and reports
   * one initial, non-watch execution, as the native command's entry would.
   */
  public createTelemetryData(options: IPhasedCommandEngineTelemetryOptions): ITelemetryData {
    const { timeOriginMs } = options;
    const data: ITelemetryData = createPhasedTelemetryData({
      ...this._action.getTelemetryFields(),
      isWatch: false,
      isInitial: true,
      durationInSeconds: options.durationInSeconds,
      succeeded: options.succeeded,
      records: options.records,
      timeOriginMs
    });
    return {
      ...data,
      extraData: { ...data.extraData, ...options.extraData },
      performanceEntries: (options.performanceEntries ?? []).map((entry: PerformanceEntry) =>
        rebasePerformanceEntry(entry, timeOriginMs)
      )
    };
  }
}

function rebasePerformanceEntry(entry: PerformanceEntry, timeOriginMs: number): PerformanceEntry {
  const { name, entryType, duration, detail } = entry;
  const startTime: number = entry.startTime - timeOriginMs;
  return {
    name,
    entryType,
    startTime,
    duration,
    detail,
    toJSON: () => ({ name, entryType, startTime, duration, detail })
  };
}

/**
 * Logs one request's telemetry entry for an engine: the graph's `beforeLogRequest` taps run first, then its
 * `beforeLog` taps if an iteration served the request, then the entry is saved and flushed.
 */
export function logEngineTelemetry(
  hooks: Pick<OperationGraphHooks, 'beforeLog' | 'beforeLogRequest'>,
  telemetry: Pick<Telemetry, 'log' | 'flush'>,
  data: ITelemetryData,
  options: IPhasedCommandEngineLogTelemetryOptions | undefined
): void {
  hooks.beforeLogRequest.call(data);
  if (options?.servedByIteration !== false) {
    hooks.beforeLog.call(data);
  }
  telemetry.log(data);
  telemetry.flush();
}

/**
 * Waits for pending `flushTelemetry` taps, but no longer than `timeoutMs`. As in the native CLI, a failed tap does
 * not fail the command.
 *
 * @returns `true` if the taps settled in time, or `false` if they are still running.
 */
export async function waitForTelemetryFlushAsync(
  flushPromise: Promise<void>,
  timeoutMs: number
): Promise<boolean> {
  let timeout: NodeJS.Timeout | undefined;
  const expiredPromise: Promise<false> = new Promise((resolve) => {
    timeout = setTimeout(() => resolve(false), timeoutMs);
  });
  try {
    return await Promise.race([
      flushPromise.then(
        () => true,
        () => true
      ),
      expiredPromise
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * The labels of `getEngineSharingBlocker` by default: the quoted command names, or `the engine's "name"` and
 * `the requested "name"` if both commands have the same name.
 */
function getDefaultSharingLabels(engineName: string, requestName: string): IPhasedCommandEngineSharingLabels {
  return engineName === requestName
    ? { engine: `the engine's "${engineName}"`, request: `the requested "${requestName}"` }
    : { engine: `"${engineName}"`, request: `"${requestName}"` };
}

/**
 * Names the parts that differ between the engine's command and the request, and which command sets each, as
 * ` (only "a" sets --x; both set --y and --z, to different values)`. Each map has only the parts that its command
 * sets. The groups of the two commands are in the order of their labels, and the group of the parts that both
 * set comes last, so the text is the same whichever command created the engine. It returns an empty string if
 * every part is the same, which happens only if two commands add the same arguments in another order.
 */
function describeDifferences(
  engineParts: ReadonlyMap<string, string>,
  requestParts: ReadonlyMap<string, string>,
  labels: IPhasedCommandEngineSharingLabels
): string {
  const onlyEngine: string[] = [];
  const onlyRequest: string[] = [];
  const both: string[] = [];
  for (const name of new Set([...engineParts.keys(), ...requestParts.keys()])) {
    const engineValue: string | undefined = engineParts.get(name);
    const requestValue: string | undefined = requestParts.get(name);
    if (engineValue === requestValue) {
      continue;
    }
    if (requestValue === undefined) {
      onlyEngine.push(name);
    } else if (engineValue === undefined) {
      onlyRequest.push(name);
    } else {
      both.push(name);
    }
  }
  const groups: [string, string[]][] = [
    [labels.engine, onlyEngine],
    [labels.request, onlyRequest]
  ];
  if (labels.request < labels.engine) {
    groups.reverse();
  }
  const descriptions: string[] = groups
    .filter(([, names]) => names.length > 0)
    .map(([label, names]) => `only ${label} sets ${formatNameList(names)}`);
  if (both.length > 0) {
    descriptions.push(`both set ${formatNameList(both)}, to different values`);
  }
  return descriptions.length > 0 ? ` (${descriptions.join('; ')})` : '';
}

/** Sorts the names and joins them as "a", "a and b" or "a, b and c". */
function formatNameList(names: string[]): string {
  const sorted: string[] = [...names].sort();
  return sorted.length > 1 ? `${sorted.slice(0, -1).join(', ')} and ${sorted[sorted.length - 1]}` : sorted[0];
}

/** Warns about the names in a daemon plugin list that match no plugin configured in rush-plugins.json. */
function warnAboutUnmatchedPluginNames(
  terminal: Terminal,
  configuredPluginNames: ReadonlySet<string>,
  listedPluginNames: ReadonlySet<string>,
  listDescription: string
): ReadonlyArray<string> {
  const unmatchedPluginNames: ReadonlyArray<string> = Array.from(listedPluginNames).filter(
    (pluginName) => !configuredPluginNames.has(pluginName)
  );
  if (unmatchedPluginNames.length > 0) {
    terminal.writeWarningLine(
      `The daemon's ${listDescription} names plugins that are not configured in rush-plugins.json: ` +
        `${unmatchedPluginNames.map((pluginName) => `"${pluginName}"`).join(', ')}. ` +
        `Check that each entry is the plugin's "pluginName".`
    );
  }
  return unmatchedPluginNames;
}
