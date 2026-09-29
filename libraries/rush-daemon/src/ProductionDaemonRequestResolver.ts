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
  type IPhasedCommandEngineSharingLabels,
  type IInputsSnapshot,
  type IOperationGraph,
  type ITelemetryData,
  type Operation,
  type OperationEnabledState,
  type RushSession
} from '@microsoft/rush-lib';
import type {
  IDaemonPhasedOperationSelection,
  IDaemonRequestEnvelope
} from '@rushstack/rush-daemon-protocol';

import {
  DaemonRequestDispatchError,
  DaemonRequestEnvironmentError,
  type IDaemonRequestResolver,
  type IResolveDaemonRequestOptions,
  type ResolvedDaemonRequest
} from './DaemonRequestDispatcher';
import { DaemonRequestUsageError } from './DaemonRequestUsageError';
import {
  WorkspaceEngineComponentFactory,
  WorkspaceEngineRecreationRequiredError,
  type IPeekWorkspaceInvalidationsOptions,
  type IWorkspaceEngineShape,
  type IWorkspaceInvalidationReconciliation
} from './WorkspaceEngineComponentFactory';
import type { IWorkspaceSession, IWorkspaceSessionComponents } from './WorkspaceSession';
import { EngineTerminalProvider } from './EngineTerminalProvider';
import { OperationOutputFingerprints } from './OperationOutputFingerprints';
import { getDaemonShutdownReason } from './DaemonShutdownError';
import { isRushxInvocation, type IWorkspaceResolverLifecycle } from './WorkspaceResolverLifecycle';
import { BUILT_IN_RUSH_COMMAND_CLASSIFICATION, classifyPhasedRushCommand } from './RushCommandRequestPolicy';
import { createInputsCompatibilityCheck, getOperationsWithChangedInputs } from './WorkspaceInputsComparison';
import { createDaemonRequestTelemetrySink, type IDaemonEngineCreationTiming } from './DaemonRequestTelemetry';

const BUILT_IN_PHASED_COMMAND_NAMES: ReadonlySet<string> = new Set(['build', 'rebuild']);

/** The parsed command that created an engine, and the Rush session that its plugins were applied to. */
interface IBoundEngine {
  readonly command: PhasedCommandEngine;
  readonly rushSession: RushSession | undefined;
}

/** A native parse of the command line of a request. */
interface IParsedCommand {
  readonly command: PhasedCommandEngine;
  readonly terminal: EngineTerminalProvider;
  readonly envelope: IDaemonRequestEnvelope;
  readonly workspaceSession: IWorkspaceSession;
}

/**
 * Binds the standalone host to a real native phased command graph on its first request.
 *
 * @remarks
 * A host is pinned to the engine of its first command. That engine serves every later request whose command it can
 * serve (`PhasedCommandEngine.getEngineSharingBlocker`): requests of the same command whose graph-affecting,
 * non-selection parameters are the same, and, if the first command is incremental, requests of other commands, for
 * example `rebuild` on the engine of `build`, or `build` on the engine of `test`. Presentation and scheduling
 * parameters (`--verbose`, `--parallelism`, `--timeline`) and whether the command is incremental are applied per
 * request instead.
 * Another built-in command, or another custom command whose own engine could serve the first command, replaces
 * the engine through a reload; any other custom command is unsupported, so that the host never switches back and
 * forth between two engines. Incompatible parameters,
 * environments, or graph inputs are rejected before scheduling; no request is retried automatically.
 * It serves build, rebuild and the phased commands of command-line.json. The initial supported surface excludes
 * external plugins that participate in the requested command
 * (unless their manifest or the repository declares them daemon-compatible), .env initialization,
 * install/watch, build event-hook scripts, and rushx/global commands. Use the unchanged native CLI for those surfaces.
 * @beta
 */
export class ProductionDaemonRequestResolver implements IDaemonRequestResolver {
  #binding: Promise<void> | undefined;
  #boundCommand: PhasedCommandEngine | undefined;
  /** The request whose handling created the warm engine, and when it did. */
  #engineCreation: (IDaemonEngineCreationTiming & { readonly requestId: string }) | undefined;
  #logTelemetry: EngineLogTelemetry | undefined;
  #loggedRequestCount: number = 0;
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

  /**
   * Rejects a rushx script and a built-in command that is not phased, since the resolver never serves either.
   *
   * @remarks
   * It reads only the envelope, so it needs no session: command-line.json cannot redefine a built-in command, so
   * the name identifies one without a parse. Whether the resolver serves a custom command is known only once its
   * command line is parsed (`getCommandParameterIdentityAsync`), so this never rejects one.
   */
  public getUnsupportedCommandError(
    envelope: IDaemonRequestEnvelope
  ): DaemonRequestDispatchError | undefined {
    if (isRushxInvocation(envelope)) {
      return new DaemonRequestDispatchError('unsupported', 'A rushx script is not a phased command request.');
    }
    if (
      Object.hasOwn(BUILT_IN_RUSH_COMMAND_CLASSIFICATION, envelope.commandName) &&
      !BUILT_IN_PHASED_COMMAND_NAMES.has(envelope.commandName)
    ) {
      return new DaemonRequestDispatchError(
        'unsupported',
        `"${envelope.commandName}" is a built-in command that is not phased.`
      );
    }
    return undefined;
  }

  /**
   * Inspects the native command shape without constructing or executing an operation graph.
   *
   * @remarks
   * Returns the identity of the bound engine's command when that engine can serve the request, so that the
   * lifecycle reuses it, and the request's own identity otherwise, so that the lifecycle reloads. A custom command
   * that the bound engine cannot serve, and whose own engine could not serve the bound engine's command, is
   * unsupported. A request whose environment differs from the startup environment is rejected only after its
   * command line parses as a phased command, so that a lifecycle restarts the daemon only for such a command.
   */
  public async getCommandParameterIdentityAsync(options: IResolveDaemonRequestOptions): Promise<string> {
    const { envelope, workspaceSession } = options;
    this.#assertServedCommand(envelope);
    const parsed: IParsedCommand = await this.#parseCommandLineAsync(options);
    this.#assertStartupEnvironment(envelope);
    // Resolving the same request uses this parse instead of parsing the same command line again.
    this.#identityParses.set(options.abortSignal, parsed);
    const { command } = parsed;
    const engine: IBoundEngine | undefined = await this.#tryGetBoundEngineAsync(workspaceSession);
    if (!engine) return command.parameterIdentity;
    const engineName: string = engine.command.commandName;
    const requestName: string = command.commandName;
    const labels: IPhasedCommandEngineSharingLabels | undefined = getSharingLabels(engineName, requestName);
    const blocker: string | undefined = getEngineSharingBlocker(engine, command, labels);
    if (blocker === undefined) return engine.command.parameterIdentity;
    if (envelope.commandOrigin === 'custom') {
      const reverseBlocker: string | undefined = getEngineSharingBlocker(
        { command, rushSession: engine.rushSession },
        engine.command,
        labels && { engine: labels.request, request: labels.engine }
      );
      if (reverseBlocker !== undefined) {
        throw new DaemonRequestDispatchError(
          'unsupported',
          describeUnsharedEngines(engineName, requestName, blocker, reverseBlocker)
        );
      }
    }
    return command.parameterIdentity;
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
      if (!(await this.#canServeAsync(command, workspaceSession))) {
        throw new WorkspaceEngineRecreationRequiredError();
      }
    } else {
      this.#boundCommand = command;
      this.#workspaceSession = workspaceSession;
      bindingStartTimeMs = performance.now();
      const binding: Promise<void> = this.#bindAsync(command, terminal, workspaceSession);
      this.#binding = binding;
      void binding.catch((error: unknown) => {
        if (error instanceof PhasedCommandEngineBusyError && this.#binding === binding) {
          this.#binding = undefined;
          this.#boundCommand = undefined;
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
      exclusivityClass: classifyPhasedRushCommand({
        commandName: command.commandName,
        commandOrigin: envelope.commandOrigin,
        isIncremental: command.isIncremental
      }),
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

  /** Whether the engine bound to `session` can serve `command`; see `PhasedCommandEngine.getEngineSharingBlocker`. */
  async #canServeAsync(command: PhasedCommandEngine, session: IWorkspaceSession): Promise<boolean> {
    if (this.#workspaceSession !== session) return false;
    // Equal identities need no initialized engine; the caller then awaits the binding and sees its error, if any.
    if (this.#boundCommand?.parameterIdentity === command.parameterIdentity) return true;
    const engine: IBoundEngine | undefined = await this.#tryGetBoundEngineAsync(session);
    return !!engine && getEngineSharingBlocker(engine, command) === undefined;
  }

  /**
   * The command and session of the engine bound to `session`, or undefined if none is bound to it or it failed to
   * initialize. The lifecycle binds engines under an exclusive transition lease, so no request that holds a lease
   * waits here for a binding in progress.
   */
  async #tryGetBoundEngineAsync(session: IWorkspaceSession): Promise<IBoundEngine | undefined> {
    const binding: Promise<void> | undefined = this.#binding;
    const command: PhasedCommandEngine | undefined = this.#boundCommand;
    if (!binding || !command || this.#workspaceSession !== session) return undefined;
    try {
      await binding;
    } catch {
      return undefined;
    }
    return { command, rushSession: session.rushSession };
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
    // Skips parsing for a command that the resolver never serves.
    this.#assertServedCommand(options.envelope);
    this.#assertStartupEnvironment(options.envelope);
    return await this.#parseCommandLineAsync(options, identityParse);
  }

  /** Throws the error of `getUnsupportedCommandError`, if it returns one. */
  #assertServedCommand(envelope: IDaemonRequestEnvelope): void {
    const unsupported: DaemonRequestDispatchError | undefined = this.getUnsupportedCommandError(envelope);
    if (unsupported) throw unsupported;
  }

  /** Rejects a request whose environment, or the daemon's own environment, differs from the startup environment. */
  #assertStartupEnvironment(envelope: IDaemonRequestEnvelope): void {
    if (environmentIdentity(envelope.environment) !== this.#environmentIdentity) {
      throw new DaemonRequestEnvironmentError();
    }
    const changedNames: string[] = this.#getChangedStartupNames();
    if (changedNames.length > 0) {
      throw new DaemonRequestDispatchError(
        'unsupported',
        `The daemon's own environment changed after it started (${changedNames.join(', ')}); a Rush plugin ` +
          'may have changed process.env. Restart the daemon or use --no-daemon.'
      );
    }
  }

  /** Parses the command line of the request, unless `identityParse` is given, and checks the parsed command. */
  async #parseCommandLineAsync(
    options: IResolveDaemonRequestOptions,
    identityParse?: IParsedCommand
  ): Promise<IParsedCommand> {
    const { envelope, workspaceSession, abortSignal } = options;
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
    // Clients mark only build and rebuild as built-in; every other phased command comes from command-line.json.
    if (
      parsed.command.commandName !== envelope.commandName ||
      BUILT_IN_PHASED_COMMAND_NAMES.has(parsed.command.commandName) !==
        (envelope.commandOrigin === 'built-in')
    ) {
      throw new DaemonRequestDispatchError(
        'invalidRequest',
        'The command name or origin does not match the native parsed argv.'
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
            ...(invalidationOptions.executingIterationRecords
              ? outputFingerprints.peekOperationsWithChangedOutputs(
                  invalidationOptions.executingIterationRecords
                )
              : outputFingerprints.getOperationsWithChangedOutputs())
          ]
        });
        const components: IWorkspaceSessionComponents = await factory.createAsync(options);
        return {
          ...components,
          // A rebuild runs every operation of each request, so no request can join another's iteration
          peekInvalidationsAsync: async (peekOptions: IPeekWorkspaceInvalidationsOptions) =>
            engine.isIncremental ? await components.peekInvalidationsAsync!(peekOptions) : undefined,
          reconcileInvalidationsAsync: async () => {
            const reconcileAsync = (): Promise<IWorkspaceInvalidationReconciliation> =>
              terminal.reconcileWithRequestDiagnosticsAsync(() => components.reconcileInvalidationsAsync!());
            if (!engine.isIncremental) {
              // Every operation runs, so no output contents are checked.
              const rebuildResult: IWorkspaceInvalidationReconciliation = await reconcileAsync();
              engine.operationGraph.invalidateOperations(undefined, 'rebuild');
              return rebuildResult;
            }
            return await outputFingerprints.walkWhileReconcilingAsync(reconcileAsync);
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

/** Explains why `engine` cannot serve `request`, or returns undefined if it can. */
function getEngineSharingBlocker(
  engine: IBoundEngine,
  request: PhasedCommandEngine,
  labels?: IPhasedCommandEngineSharingLabels
): string | undefined {
  if (engine.command.parameterIdentity === request.parameterIdentity) return undefined;
  if (!engine.rushSession) return 'the engine has no Rush session';
  return engine.command.getEngineSharingBlocker(request, engine.rushSession, labels);
}

/**
 * How the reasons name the command that created the daemon's engine and the requested command if both have the same
 * name, or undefined for the quoted names.
 */
function getSharingLabels(
  engineName: string,
  requestName: string
): IPhasedCommandEngineSharingLabels | undefined {
  return engineName === requestName
    ? { engine: `the earlier "${engineName}"`, request: `this "${requestName}"` }
    : undefined;
}

/**
 * Why neither the daemon's engine nor an engine created by the requested command could serve the other's command.
 * If both reasons are the same, it gives the reason once.
 */
function describeUnsharedEngines(
  engineName: string,
  requestName: string,
  blocker: string,
  reverseBlocker: string
): string {
  const sameName: boolean = engineName === requestName;
  const creator: string = sameName ? `an earlier "${engineName}"` : `"${engineName}"`;
  const served: string = sameName ? 'the earlier one' : `"${engineName}"`;
  const request: string = sameName ? `this "${requestName}"` : `"${requestName}"`;
  const unserved: string = `The daemon's engine, created by ${creator}, cannot serve ${request}`;
  return blocker === reverseBlocker
    ? `${unserved}, and an engine created by ${request} could not serve ${served} either, because ${blocker}.`
    : `${unserved} because ${blocker}, and an engine created by ${request} could not serve ${served} ` +
        `because ${reverseBlocker}.`;
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
