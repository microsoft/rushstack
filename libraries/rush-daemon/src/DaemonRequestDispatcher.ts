// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IPhasedCommandEngineRequestSettings, WorkspaceInputChangeTier } from '@microsoft/rush-lib';
import type {
  IDaemonCommandResult,
  IDaemonEventEnvelope,
  IDaemonPhasedRequest,
  IDaemonPhasedRequestResult,
  IDaemonRequestEnvelope,
  IDaemonRequestQueuePositionMessage,
  IDaemonTerminalPolicyResult
} from '@rushstack/rush-daemon-protocol';

import type { GlobalCommandExecutor } from './GlobalCommandRequestRouter';
import { GlobalCommandRequestRouter } from './GlobalCommandRequestRouter';
import type { IResolvedGlobalCommandRequest } from './GlobalCommandRequest';
import type { IInteractiveRequestSession } from './InteractiveRequestInputRouter';
import type { IPhasedRequestClient } from './PhasedRequestClient';
import { PhasedRequestRouter } from './PhasedRequestRouter';
import { writeRequestStartedAsync } from './RequestStartedNotice';
import type { IGlobalCommandRequestClient } from './GlobalCommandRequestClient';
import type { IPhasedRequestTelemetrySink } from './PhasedRequestTelemetry';
import type { IWorkspaceSession } from './WorkspaceSession';
import type { RequestExclusivityClass } from './RequestScheduler';
import { DaemonGraphRequestRouter } from './DaemonGraphRequestRouter';
import { getDaemonGraphObserver } from './DaemonGraphObserver';
import { isRushxInvocation, type IWorkspaceResolverLifecycle } from './WorkspaceResolverLifecycle';

/** A request resolved by the integration that owns Rush command parsing. @beta */
export type ResolvedDaemonRequest = IResolvedDaemonPhasedRequest | IResolvedDaemonGlobalRequest;

/** A resolver outcome that uses the existing typed phased-request contract. @beta */
export interface IResolvedDaemonPhasedRequest {
  readonly kind: 'phased';
  readonly request: IDaemonPhasedRequest;
  /** Native selection has already resolved all required project/phase dependencies. */
  readonly exactSelection?: boolean;
  /** Verbosity and parallelism for this request; applied to the shared graph before its iteration. */
  readonly requestSettings?: IPhasedCommandEngineRequestSettings;
  /**
   * Workspace admission class of the parsed command. Defaults to the built-in command classification, which
   * makes every command that is not built in `EXCLUSIVE`.
   */
  readonly exclusivityClass?: RequestExclusivityClass;
  /** Receives the request's telemetry report once it has taken part in a graph iteration or no-op check. */
  readonly telemetry?: IPhasedRequestTelemetrySink;
}

/** A resolver outcome that uses the existing isolated global executor contract. @beta */
export interface IResolvedDaemonGlobalRequest {
  readonly executor: GlobalCommandExecutor;
  readonly kind: 'global';
}

/** How the host lifecycle admitted one request, for request-scoped telemetry. @beta */
export interface IDaemonRequestLifecycleInfo {
  /** The `performance.now()` timestamp at which the lifecycle received the request. */
  readonly receivedTimeMs: number;
  /** The `performance.now()` timestamp at which the lifecycle had prepared the request's workspace generation. */
  readonly preparedTimeMs: number;
  /** How the lifecycle reconciled the workspace inputs for this request. */
  readonly reloadTier: WorkspaceInputChangeTier;
}

/** Context supplied to an integration-owned request resolver. @beta */
export interface IResolveDaemonRequestOptions {
  /** Aborts when the request is cancelled, disconnected, or the host shuts down. */
  readonly abortSignal: AbortSignal;
  readonly envelope: IDaemonRequestEnvelope;
  /** Present when a host lifecycle admitted the request. */
  readonly lifecycleInfo?: IDaemonRequestLifecycleInfo;
  readonly workspaceSession: IWorkspaceSession;
}

/** Resolves a validated wire envelope without coupling rushd to CLI parser internals. @beta */
export interface IDaemonRequestResolver {
  readonly workspaceLifecycle?: IWorkspaceResolverLifecycle;
  readonly [Symbol.asyncDispose]?: () => Promise<void>;
  resolveRequestAsync(options: IResolveDaemonRequestOptions): Promise<ResolvedDaemonRequest>;
}

/** Why a validated wire request could not be dispatched. @beta */
export type DaemonRequestDispatchErrorCode = 'invalidRequest' | 'routingFailed' | 'unsupported';

/** A typed request-routing failure suitable for a terminal wire rejection. @beta */
export class DaemonRequestDispatchError extends Error {
  public readonly code: DaemonRequestDispatchErrorCode;

  public constructor(code: DaemonRequestDispatchErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'DaemonRequestDispatchError';
    this.code = code;
  }
}

/**
 * A phased command request whose environment differs from the daemon's startup environment. A host lifecycle
 * restarts the daemon from that environment, as it does for build. Without one, the client runs the command
 * in-process.
 */
export class DaemonRequestEnvironmentError extends DaemonRequestDispatchError {
  public constructor() {
    super(
      'unsupported',
      'The request environment differs from the daemon startup environment. Restart the daemon from this ' +
        'environment or use --no-daemon.'
    );
    this.name = 'DaemonRequestEnvironmentError';
  }
}

/** Wire destination consumed by the shared request dispatcher. @beta */
export interface IDaemonRequestDispatchClient {
  readonly abortSignal: AbortSignal;
  readonly interactiveSession: IInteractiveRequestSession;
  /**
   * The `performance.now()` timestamp at which the transport read the request. A host lifecycle reports it as the
   * request's {@link IDaemonRequestLifecycleInfo.receivedTimeMs}. When it is omitted, the request counts as received
   * when its dispatch starts.
   */
  readonly receivedTimeMs?: number;
  readonly sessionId: string;
  readonly supportsRequestAdmission: boolean;
  getNextEventSequence(): number;
  /** {@inheritDoc IPhasedRequestClient.waitForConnectingClientsAsync} */
  waitForConnectingClientsAsync?(): Promise<void>;
  writeEventAsync(event: IDaemonEventEnvelope): Promise<void>;
  writeLogChunkAsync(operationId: string, stream: 'stdout' | 'stderr', chunk: Uint8Array): Promise<void>;
  writeQueuePositionAsync(message: IDaemonRequestQueuePositionMessage): Promise<void>;
  /** {@inheritDoc IPhasedRequestClient.writeRequestStartedAsync} */
  writeRequestStartedAsync?(): Promise<void>;
  writeResultAsync(result: IDaemonCommandResult | IDaemonPhasedRequestResult): Promise<void>;
  writeTerminalChunkAsync(stream: 'stdout' | 'stderr', chunk: Uint8Array): Promise<void>;
  writeTerminalPolicyAsync(result: IDaemonTerminalPolicyResult): Promise<void>;
}

/** Immutable generation selected before command resolution. @beta */
export interface IDispatchWorkspaceRequestOptions {
  readonly envelope: IDaemonRequestEnvelope;
  readonly client: IDaemonRequestDispatchClient;
  readonly workspaceSession: IWorkspaceSession;
  readonly resolver: IDaemonRequestResolver | undefined;
  readonly onExecutionStarting?: () => void;
  /**
   * Present when a host lifecycle admitted the request. Its `receivedTimeMs` also decides whether a phased request
   * can join a batch whose input reconcile has started; see {@link PhasedRequestRouter.executeAsync}.
   */
  readonly lifecycleInfo?: IDaemonRequestLifecycleInfo;
}

/** Executes an already admitted workspace generation without resolving against another session. @beta */
export type DispatchWorkspaceRequestAsync = (
  options: IDispatchWorkspaceRequestOptions
) => Promise<IDaemonCommandResult | undefined>;

/** Host-owned lifecycle admission surrounding existing command routers. @beta */
export interface IDaemonRequestLifecycle extends AsyncDisposable {
  dispatchAsync(
    envelope: IDaemonRequestEnvelope,
    client: IDaemonRequestDispatchClient,
    dispatchAsync: DispatchWorkspaceRequestAsync
  ): Promise<void>;
}

/**
 * Shared resolver-backed integration between wire requests and the accumulated typed WS2 routers.
 *
 * @beta
 */
export class DaemonRequestDispatcher implements AsyncDisposable {
  readonly #resolver: IDaemonRequestResolver | undefined;
  readonly #workspaceSession: IWorkspaceSession | undefined;
  readonly #lifecycle: IDaemonRequestLifecycle | undefined;
  #disposePromise: Promise<void> | undefined;

  public constructor(
    workspaceSession: IWorkspaceSession,
    resolver?: IDaemonRequestResolver,
    lifecycle?: IDaemonRequestLifecycle
  ) {
    this.#workspaceSession = lifecycle ? undefined : workspaceSession;
    this.#resolver = lifecycle ? undefined : resolver;
    this.#lifecycle = lifecycle;
  }

  public async dispatchAsync(
    envelope: IDaemonRequestEnvelope,
    client: IDaemonRequestDispatchClient
  ): Promise<void> {
    if (this.#lifecycle) {
      await this.#lifecycle.dispatchAsync(envelope, client, dispatchWorkspaceRequestAsync);
    } else {
      await dispatchWorkspaceRequestAsync({
        envelope,
        client,
        workspaceSession: this.#workspaceSession!,
        resolver: this.#resolver
      });
    }
  }

  public [Symbol.asyncDispose](): Promise<void> {
    this.#disposePromise ??= this.#lifecycle
      ? Promise.resolve(this.#lifecycle[Symbol.asyncDispose]())
      : (this.#resolver?.[Symbol.asyncDispose]?.() ?? Promise.resolve());
    return this.#disposePromise;
  }
}

async function dispatchWorkspaceRequestAsync(
  options: IDispatchWorkspaceRequestOptions
): Promise<IDaemonCommandResult | undefined> {
  const { envelope, client, workspaceSession, resolver, lifecycleInfo } = options;
  // Runs just before the request can have an effect. The client knows that the request may have run before it does.
  const startExecutionAsync = async (): Promise<void> => {
    options.onExecutionStarting?.();
    await writeRequestStartedAsync(client);
  };
  workspaceSession.assertActive?.();
  if (isDaemonGraphCommand(envelope)) {
    await startExecutionAsync();
    await new DaemonGraphRequestRouter(workspaceSession).executeAsync(envelope, client);
    return undefined;
  }
  if (!resolver) {
    throw new DaemonRequestDispatchError(
      'unsupported',
      'This daemon host has no command request integration configured.'
    );
  }
  const resolved: ResolvedDaemonRequest = await resolver.resolveRequestAsync({
    abortSignal: client.abortSignal,
    envelope,
    lifecycleInfo,
    workspaceSession
  });
  workspaceSession.assertActive?.();
  if (workspaceSession.operationGraph) {
    getDaemonGraphObserver(workspaceSession.operationGraph);
  }
  if (resolved.kind === 'phased') {
    validateResolvedPhasedRequest(envelope, resolved.request);
    return await new PhasedRequestRouter(workspaceSession).executeAsync(
      resolved.request,
      createPhasedClient(client),
      resolved.exactSelection,
      options.onExecutionStarting,
      resolved.requestSettings,
      resolved.telemetry,
      lifecycleInfo?.receivedTimeMs ?? client.receivedTimeMs,
      resolved.exclusivityClass
    );
  }
  const globalRouter: GlobalCommandRequestRouter = new GlobalCommandRequestRouter(workspaceSession);
  const request: IResolvedGlobalCommandRequest = globalRouter.resolveRequest({
    admission: envelope.admission,
    commandName: envelope.commandName,
    commandOrigin: isRushxInvocation(envelope) ? 'custom' : envelope.commandOrigin,
    cwd: envelope.cwd,
    environment: envelope.environment,
    invocationKind: isRushxInvocation(envelope) ? 'rushx' : 'rush',
    requestId: envelope.requestId,
    terminal: {
      ...envelope.terminal,
      columns: envelope.terminal.columns
    }
  });
  return await globalRouter.executeAsync(
    request,
    async (context) => {
      workspaceSession.assertActive?.();
      await startExecutionAsync();
      return await resolved.executor(context);
    },
    createGlobalClient(client)
  );
}

/** Whether the dispatcher answers the request with the daemon's graph router instead of the resolver. */
export function isDaemonGraphCommand(envelope: IDaemonRequestEnvelope): boolean {
  return (
    !isRushxInvocation(envelope) &&
    envelope.commandOrigin === 'built-in' &&
    (envelope.commandName === 'daemon' || (envelope.argv[0] === 'daemon' && envelope.argv[1] === 'graph'))
  );
}

function validateResolvedPhasedRequest(
  envelope: IDaemonRequestEnvelope,
  request: IDaemonPhasedRequest
): void {
  if (
    request.requestId !== envelope.requestId ||
    request.commandName !== envelope.commandName ||
    request.commandOrigin !== envelope.commandOrigin
  ) {
    throw new DaemonRequestDispatchError(
      'invalidRequest',
      'The resolved phased request identity does not match its wire envelope.'
    );
  }
}

function createPhasedClient(client: IDaemonRequestDispatchClient): IPhasedRequestClient {
  return client;
}

function createGlobalClient(client: IDaemonRequestDispatchClient): IGlobalCommandRequestClient {
  return client;
}
