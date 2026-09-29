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
import { PhasedScriptAction } from '../cli/scriptActions/PhasedScriptAction';
import type { GetInputsSnapshotAsyncFn, IInputsSnapshot } from '../logic/incremental/InputsSnapshot';
import type { IOperationGraph } from '../logic/operations/IOperationGraph';
import type { Operation, OperationEnabledState } from '../logic/operations/Operation';
import type { OperationStatus } from '../logic/operations/OperationStatus';
import type { Parallelism } from '../logic/operations/ParseParallelism';
import { PhasedCommandEngineExecution } from '../logic/operations/PhasedCommandEngineExecution';
import { createPhasedTelemetryData } from '../logic/operations/PhasedCommandTelemetry';
import { type ITelemetryData, Telemetry } from '../logic/Telemetry';
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
   * Logs one request's telemetry entry the way a native iteration logs its own: `beforeLog` taps run first, then
   * the entry is saved under `common/temp/telemetry` and passed to `flushTelemetry` taps. Disposing the engine waits
   * up to 2 seconds for taps that are still running; a tap that takes longer, such as an upload over a stalled
   * network, keeps running in the background, so that it cannot hold the host. Saving does nothing when telemetry
   * is disabled for the repository.
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
   * without an iteration, `beforeLog` taps are skipped, because they would describe an earlier iteration.
   * Defaults to `true`.
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
 * shared graph (`IOperationGraph.quietMode` / `IOperationGraph.parallelism`) before each iteration.
 * @alpha
 */
export interface IPhasedCommandEngineRequestSettings {
  readonly quietMode: boolean;
  readonly parallelism: Parallelism;
}

/**
 * A parsed native build/rebuild command. Parsing never runs scripts or changes cwd/process.env.
 *
 * @remarks
 * The initial engine surface deliberately rejects watch/install, event-hook scripts, .env files, and
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
    this.parameterIdentity = action.getEngineParameterIdentity();
    this.unmatchedCompatiblePluginNames = unmatchedCompatiblePluginNames;
  }

  /**
   * Parses a native build or rebuild command line. Throws a {@link PhasedCommandEngineUsageError} for a command
   * line that native Rush rejects as invalid.
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
      // Native Rush prints this message and exits with this exit code.
      if (error instanceof CommandLineParserExitError && error.exitCode !== 0) {
        throw new PhasedCommandEngineUsageError(error.message.trim(), error.exitCode, { cause: error });
      }
      throw error;
    }
    const action: CommandLineAction | undefined = parser.selectedAction;
    if (!(action instanceof PhasedScriptAction) || !['build', 'rebuild'].includes(action.actionName)) {
      throw new Error('The production daemon engine currently supports native build and rebuild only.');
    }
    const compatiblePluginNames: ReadonlySet<string> = new Set(rushConfiguration.daemon.compatiblePlugins);
    const configuredPluginNames: ReadonlySet<string> = parser.pluginManager.configuredPluginNames;
    const unmatchedCompatiblePluginNames: ReadonlyArray<string> = Array.from(compatiblePluginNames).filter(
      (pluginName) => !configuredPluginNames.has(pluginName)
    );
    if (unmatchedCompatiblePluginNames.length > 0) {
      new Terminal(terminalProvider).writeWarningLine(
        `The daemon's compatible plugin list (rush.json "daemon.compatiblePlugins" or ` +
          `RUSH_DAEMON_COMPATIBLE_PLUGINS) names plugins that are not configured in rush-plugins.json: ` +
          `${unmatchedCompatiblePluginNames.map((pluginName) => `"${pluginName}"`).join(', ')}. ` +
          `Check that each entry is the plugin's "pluginName".`
      );
    }
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
   */
  public async createEngineAsync(preparationLock?: LockFile): Promise<IPhasedCommandEngine> {
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
    const lock: LockFile | undefined = preparationLock ?? LockFile.tryAcquire(lockFolder, 'rush');
    if (!lock) throw new PhasedCommandEngineBusyError();
    this._created = true;
    let engine: IPhasedCommandEngine | undefined;
    let releaseAttempted: boolean = false;
    try {
      await this._parser.pluginManager.tryInitializeUnassociatedPluginsAsync();
      engine = await this._action.createEngineAsync();
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
        logTelemetry: (data: ITelemetryData, options?: IPhasedCommandEngineLogTelemetryOptions) => {
          if (options?.servedByIteration !== false) {
            operationGraph.hooks.beforeLog.call(data);
          }
          telemetry.log(data);
          telemetry.flush();
        },
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
