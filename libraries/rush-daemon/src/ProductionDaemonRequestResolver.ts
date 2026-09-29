// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AlreadyReportedError } from '@rushstack/node-core-library';
import type { LockFile } from '@rushstack/node-core-library';
import {
  EnvironmentVariableNames,
  getWorkspaceFingerprintEnvironmentEntries,
  PhasedCommandEngine,
  PhasedCommandEngineBusyError,
  PhasedCommandEngineConfigurationChangedError,
  PhasedCommandEngineProjectConfigurationError,
  PhasedCommandEngineUsageError,
  type IPhasedCommandEngine,
  type IPhasedCommandEngineLogTelemetryOptions,
  type IInputsSnapshot,
  type IOperationGraph,
  type ITelemetryData,
  type Operation,
  type OperationEnabledState
} from '@microsoft/rush-lib';
import type { IDaemonPhasedOperationSelection, IDaemonRequestEnvelope } from '@rushstack/rush-daemon-protocol';

import {
  DaemonRequestDispatchError,
  type IDaemonRequestResolver,
  type IResolveDaemonRequestOptions,
  type ResolvedDaemonRequest
} from './DaemonRequestDispatcher';
import { DaemonRequestUsageError } from './DaemonRequestUsageError';
import {
  WorkspaceEngineComponentFactory,
  WorkspaceEngineRecreationRequiredError,
  type IWorkspaceEngineShape,
  type IWorkspaceInvalidationReconciliation
} from './WorkspaceEngineComponentFactory';
import type { IWorkspaceSession, IWorkspaceSessionComponents } from './WorkspaceSession';
import { EngineTerminalProvider } from './EngineTerminalProvider';
import { OperationOutputFingerprints } from './OperationOutputFingerprints';
import { getDaemonShutdownReason } from './DaemonShutdownError';
import type { IWorkspaceResolverLifecycle } from './WorkspaceResolverLifecycle';
import { createInputsCompatibilityCheck, getOperationsWithChangedInputs } from './WorkspaceInputsComparison';
import { createDaemonRequestTelemetrySink, type IDaemonEngineCreationTiming } from './DaemonRequestTelemetry';

/** A native parse of the command line of a request. */
interface IParsedCommand {
  readonly command: PhasedCommandEngine;
  readonly terminal: EngineTerminalProvider;
  readonly envelope: IDaemonRequestEnvelope;
  readonly workspaceSession: IWorkspaceSession;
}

/**
 * Binds the standalone host to a real native build/rebuild graph on its first request.
 *
 * @remarks
 * A host is pinned to its first command and graph-affecting, non-selection parameters. Presentation and
 * scheduling parameters (`--verbose`, `--parallelism`, `--timeline`) are applied per request instead.
 * Incompatible parameters,
 * environments, or graph inputs are rejected before scheduling; no request is retried automatically.
 * The initial supported surface excludes external plugins that participate in the requested command
 * (unless their manifest or the repository declares them daemon-compatible), .env initialization,
 * install/watch, event-hook scripts, and rushx/global commands. Use the unchanged native CLI for those surfaces.
 * @beta
 */
export class ProductionDaemonRequestResolver implements IDaemonRequestResolver {
  #binding: Promise<void> | undefined;
  /** The request whose handling created the warm engine, and when it did. */
  #engineCreation: (IDaemonEngineCreationTiming & { readonly requestId: string }) | undefined;
  #logTelemetry: EngineLogTelemetry | undefined;
  #loggedRequestCount: number = 0;
  #parameterIdentity: string | undefined;
  #workspaceSession: IWorkspaceSession | undefined;
  readonly #environmentIdentity: string;
  readonly #preparationLock: LockFile | undefined;
  /** The daemon's environment when it started. Replacement sessions keep it; see `createForSession`. */
  readonly #startupEnvironment: Readonly<Record<string, string | undefined>>;
  readonly #validateGraphInputsAsync: (() => Promise<void>) | undefined;
  // The workspace lifecycle checks the command identity of a request, and then resolves the request under the same
  // admission lease. Keyed by the abort signal of the request, a parse is kept only as long as its request.
  readonly #identityParses: WeakMap<AbortSignal, IParsedCommand> = new WeakMap();

  public constructor(options?: {
    readonly preparationLock?: LockFile;
    readonly validateGraphInputsAsync?: () => Promise<void>;
    /** The environment that requests must match. Defaults to a copy of `process.env`. */
    readonly startupEnvironment?: Readonly<Record<string, string | undefined>>;
  }) {
    this.#preparationLock = options?.preparationLock;
    this.#validateGraphInputsAsync = options?.validateGraphInputsAsync;
    this.#startupEnvironment = options?.startupEnvironment ?? { ...process.env };
    this.#environmentIdentity = environmentIdentity(this.#startupEnvironment);
  }

  public get workspaceLifecycle(): IWorkspaceResolverLifecycle {
    return this;
  }

  /**
   * Creates an unbound resolver for a replacement session without carrying old runner definitions.
   * It keeps the startup environment, because a plugin may have added names to `process.env` since then.
   */
  public createForSession(
    preparationLock?: LockFile,
    validateGraphInputsAsync?: () => Promise<void>
  ): ProductionDaemonRequestResolver {
    return new ProductionDaemonRequestResolver({
      preparationLock,
      validateGraphInputsAsync,
      startupEnvironment: this.#startupEnvironment
    });
  }

  /** Inspects the native command shape without constructing or executing an operation graph. */
  public async getCommandParameterIdentityAsync(options: IResolveDaemonRequestOptions): Promise<string> {
    const parsed: IParsedCommand = await this.#parseCommandAsync(options);
    // Resolving the same request uses this parse instead of parsing the same command line again.
    this.#identityParses.set(options.abortSignal, parsed);
    return parsed.command.parameterIdentity;
  }

  public async resolveRequestAsync(options: IResolveDaemonRequestOptions): Promise<ResolvedDaemonRequest> {
    const resolveStartTimeMs: number = performance.now();
    const { envelope, workspaceSession } = options;
    const { command, terminal }: IParsedCommand = await this.#parseCommandAsync(
      options,
      this.#takeIdentityParse(options)
    );
    let bindingStartTimeMs: number | undefined;
    if (this.#binding) {
      if (
        this.#parameterIdentity !== command.parameterIdentity ||
        this.#workspaceSession !== workspaceSession
      ) {
        throw new WorkspaceEngineRecreationRequiredError();
      }
    } else {
      this.#parameterIdentity = command.parameterIdentity;
      this.#workspaceSession = workspaceSession;
      bindingStartTimeMs = performance.now();
      const binding: Promise<void> = this.#bindAsync(command, terminal, workspaceSession);
      this.#binding = binding;
      void binding.catch((error: unknown) => {
        if (error instanceof PhasedCommandEngineBusyError && this.#binding === binding) {
          this.#binding = undefined;
          this.#parameterIdentity = undefined;
          this.#workspaceSession = undefined;
        }
      });
    }
    await this.#binding;
    if (bindingStartTimeMs !== undefined) {
      this.#engineCreation = {
        requestId: envelope.requestId,
        startTimeMs: bindingStartTimeMs,
        endTimeMs: performance.now()
      };
    }
    const graph: IOperationGraph | undefined = workspaceSession.operationGraph;
    const shape: IWorkspaceEngineShape | undefined = workspaceSession.engineShape;
    if (!graph || !shape) throw new Error('Native engine initialization did not bind a workspace graph.');
    let selection: ReadonlyMap<Operation, OperationEnabledState>;
    try {
      selection = await command.selectOperationsAsync(graph);
    } catch (error) {
      throw new DaemonRequestDispatchError('invalidRequest', terminal.describeError(error), { cause: error });
    }
    const operationSelection: IDaemonPhasedOperationSelection[] = [];
    for (const [operation, enabledState] of selection) {
      if (enabledState !== false) operationSelection.push({ operationId: operation.name, enabledState });
    }
    const logTelemetry: EngineLogTelemetry | undefined = this.#logTelemetry;
    // A workspace lifecycle may bind the engine with this request before it dispatches the request.
    const engineCreation: IDaemonEngineCreationTiming | undefined =
      this.#engineCreation?.requestId === envelope.requestId ? this.#engineCreation : undefined;
    return {
      kind: 'phased',
      exactSelection: true,
      requestSettings: command.requestSettings,
      telemetry: logTelemetry
        ? createDaemonRequestTelemetrySink({
            command,
            logTelemetry,
            workspaceSession,
            lifecycleInfo: options.lifecycleInfo,
            resolveStartTimeMs,
            resolveEndTimeMs: performance.now(),
            engineCreation,
            getRequestIndex: () => ++this.#loggedRequestCount
          })
        : undefined,
      request: {
        admission: envelope.admission,
        commandName: envelope.commandName,
        commandOrigin: envelope.commandOrigin,
        engineShape: shape,
        // Native Rush assigns the invocation's folder at CLI startup (Rush._assignRushInvokedFolder).
        environment: {
          ...envelope.environment,
          [EnvironmentVariableNames.RUSH_INVOKED_FOLDER]: envelope.cwd
        },
        operationSelection,
        requestId: envelope.requestId,
        returnEarlyOnFailure: envelope.returnEarlyOnFailure,
        terminalRequirement: envelope.terminal.terminalRequirement
      }
    };
  }

  /** Returns the parse of the identity check of this request, if its command line and session are unchanged. */
  #takeIdentityParse(options: IResolveDaemonRequestOptions): IParsedCommand | undefined {
    const parsed: IParsedCommand | undefined = this.#identityParses.get(options.abortSignal);
    this.#identityParses.delete(options.abortSignal);
    return parsed && isSameCommandLine(parsed, options) ? parsed : undefined;
  }

  async #parseCommandAsync(
    options: IResolveDaemonRequestOptions,
    identityParse?: IParsedCommand
  ): Promise<IParsedCommand> {
    const { envelope, workspaceSession, abortSignal } = options;
    if (!['build', 'rebuild'].includes(envelope.commandName) || envelope.commandOrigin !== 'built-in') {
      throw new DaemonRequestDispatchError(
        'unsupported',
        'The production daemon requires an explicitly identified native build/rebuild request. Ambiguous custom/rushx requests require --no-daemon.'
      );
    }
    if (environmentIdentity(envelope.environment) !== this.#environmentIdentity) {
      throw new DaemonRequestDispatchError(
        'unsupported',
        'The request environment differs from the daemon startup environment. Restart the daemon from this environment or use --no-daemon.'
      );
    }
    const changedNames: string[] = this.#getChangedStartupNames();
    if (changedNames.length > 0) {
      throw new DaemonRequestDispatchError(
        'unsupported',
        `The daemon's own environment changed after it started (${changedNames.join(', ')}); a Rush plugin ` +
          'may have changed process.env. Restart the daemon or use --no-daemon.'
      );
    }
    let parsed: IParsedCommand | undefined = identityParse;
    if (!parsed) {
      const terminal: EngineTerminalProvider = new EngineTerminalProvider();
      try {
        const command: PhasedCommandEngine = await PhasedCommandEngine.parseAsync({
          argv: envelope.argv,
          cwd: envelope.cwd,
          environment: envelope.environment,
          rushConfiguration: workspaceSession.rushConfiguration,
          terminalProvider: terminal
        });
        parsed = { command, terminal, envelope, workspaceSession };
      } catch (error) {
        // Answer only for a command line of the requested command; in-process Rush reports any other one.
        if (error instanceof PhasedCommandEngineUsageError && envelope.argv[0] === envelope.commandName) {
          throw new DaemonRequestUsageError(terminal.describeError(error), error.exitCode, { cause: error });
        }
        throw new DaemonRequestDispatchError('unsupported', terminal.describeError(error), { cause: error });
      }
    }
    if (parsed.command.commandName !== envelope.commandName) {
      throw new DaemonRequestDispatchError(
        'invalidRequest',
        'The command name does not match the native parsed argv.'
      );
    }
    if (abortSignal.aborted)
      throw new DaemonRequestDispatchError(
        'routingFailed',
        getDaemonShutdownReason(abortSignal)?.message ??
          'The request was cancelled before engine initialization.'
      );
    return parsed;
  }

  /**
   * The names of the startup environment whose value in `process.env` changed or was removed since startup.
   *
   * @remarks
   * Engine code runs in this process, and a plugin may add its own names to `process.env`, for example to pass
   * a session ID to its operations. Native Rush keeps such names for the rest of the command, so they are not
   * a difference from the client's environment, and are not reported here. Otherwise every request after the
   * plugin's first write would fall back to in-process Rush. A request whose own environment sets an added name
   * still differs from the startup environment.
   *
   * Both values are compared as the workspace fingerprint records them. The startup entries drop repeated PATH
   * entries, so a raw live PATH that repeats an entry would otherwise count as changed on every request.
   */
  #getChangedStartupNames(): string[] {
    const liveEnvironment: NodeJS.ProcessEnv = process.env;
    return getWorkspaceFingerprintEnvironmentEntries(this.#startupEnvironment)
      .filter(([name, value]) => getFingerprintValue(name, liveEnvironment[name]) !== value)
      .map(([name]) => name);
  }

  async #bindAsync(
    command: PhasedCommandEngine,
    terminal: EngineTerminalProvider,
    session: IWorkspaceSession
  ): Promise<void> {
    if (!session.initializeEngineAsync) throw new Error('This session cannot bind a native engine.');
    if (command.unmatchedCompatiblePluginNames.length > 0) {
      // The binding request's output also carries this warning; the launcher log keeps it for daemon diagnostics.
      process.stderr.write(
        `Warning: the daemon's compatible plugin list names plugins that are not configured in ` +
          `rush-plugins.json: ${command.unmatchedCompatiblePluginNames.join(', ')}\n`
      );
    }
    await session.initializeEngineAsync(async (options) => {
      let engine: IPhasedCommandEngine;
      try {
        engine = await command.createEngineAsync(this.#preparationLock);
      } catch (error) {
        if (error instanceof PhasedCommandEngineBusyError) throw error;
        if (error instanceof PhasedCommandEngineProjectConfigurationError) {
          throw createProjectConfigurationFallback(error);
        }
        throw new Error(terminal.describeError(error), { cause: error });
      }
      try {
        this.#logTelemetry = engine.logTelemetry;
        terminal.attach(engine.operationGraph);
        const outputFingerprints: OperationOutputFingerprints = new OperationOutputFingerprints(
          engine.operationGraph
        );
        const checkInputsCompatibility: (snapshot: IInputsSnapshot) => void = createInputsCompatibilityCheck(
          engine.inputsSnapshot
        );
        const factory: WorkspaceEngineComponentFactory = new WorkspaceEngineComponentFactory({
          createEngineComponentsAsync: async () => ({
            ...engine,
            getInputsSnapshotAsync: async () => {
              let snapshot: IInputsSnapshot | undefined;
              try {
                snapshot = await engine.getInputsSnapshotAsync();
              } catch (error) {
                if (error instanceof PhasedCommandEngineConfigurationChangedError) {
                  throw new WorkspaceEngineRecreationRequiredError();
                }
                throw error;
              }
              if (snapshot && !this.#validateGraphInputsAsync) checkInputsCompatibility(snapshot);
              return snapshot;
            }
          }),
          shape: engine,
          refreshInputsOnEveryRequest: true,
          validateGraphInputsAsync: this.#validateGraphInputsAsync,
          mapInvalidationsToOperationsAsync: async (invalidationOptions) => [
            ...getOperationsWithChangedInputs(invalidationOptions),
            // Outputs are git-ignored and absent from state hashes, so check them separately.
            ...outputFingerprints.getOperationsWithChangedOutputs()
          ]
        });
        const components: IWorkspaceSessionComponents = await factory.createAsync(options);
        return {
          ...components,
          reconcileInvalidationsAsync: async () => {
            const result: IWorkspaceInvalidationReconciliation =
              await terminal.reconcileWithRequestDiagnosticsAsync(() =>
                components.reconcileInvalidationsAsync!()
              );
            if (!engine.isIncremental) engine.operationGraph.invalidateOperations(undefined, 'rebuild');
            return result;
          }
        };
      } catch (error) {
        this.#logTelemetry = undefined;
        try {
          await engine[Symbol.asyncDispose]();
        } catch (cleanupError) {
          throw new AggregateError(
            [error, cleanupError],
            'Failed to initialize and dispose the native engine.'
          );
        }
        throw error;
      }
    });
  }
}

/**
 * An engine loads the configuration of every project, whereas native Rush loads only the projects that a request
 * selects. In-process Rush can therefore serve a request that the daemon cannot, for example after a filtered
 * install, and it reports the error itself if the request selects the project.
 */
function createProjectConfigurationFallback(
  error: PhasedCommandEngineProjectConfigurationError
): DaemonRequestDispatchError {
  // The launcher log keeps the whole error for daemon diagnostics; the client prints one line.
  process.stderr.write(`Warning: ${error.message}\n`);
  const cause: unknown = error.cause;
  const detail: string =
    cause instanceof Error && !(cause instanceof AlreadyReportedError)
      ? `: ${cause.message.split('\n', 1)[0]}`
      : '';
  const hint: string =
    (cause as { code?: unknown } | undefined)?.code === 'MODULE_NOT_FOUND'
      ? ' (the daemon loads every project, so it needs a full "rush install")'
      : '';
  return new DaemonRequestDispatchError(
    'unsupported',
    `The daemon could not load the configuration of project "${error.projectName}"${detail}${hint}`,
    { cause: error }
  );
}

type EngineLogTelemetry = (data: ITelemetryData, options?: IPhasedCommandEngineLogTelemetryOptions) => void;

function environmentIdentity(environment: Readonly<Record<string, string | undefined>>): string {
  return JSON.stringify(getWorkspaceFingerprintEnvironmentEntries(environment));
}

/** Whether a parse has exactly the inputs that parsing the command line of this request would have. */
function isSameCommandLine(parsed: IParsedCommand, options: IResolveDaemonRequestOptions): boolean {
  const { envelope, workspaceSession } = options;
  return (
    parsed.workspaceSession === workspaceSession &&
    parsed.envelope.requestId === envelope.requestId &&
    parsed.envelope.argv === envelope.argv &&
    parsed.envelope.cwd === envelope.cwd &&
    parsed.envelope.environment === envelope.environment
  );
}

/** The value of one variable as {@link getWorkspaceFingerprintEnvironmentEntries} records it, if it is set. */
function getFingerprintValue(name: string, value: string | undefined): string | undefined {
  return value === undefined
    ? undefined
    : getWorkspaceFingerprintEnvironmentEntries({ [name]: value })[0]?.[1];
}
