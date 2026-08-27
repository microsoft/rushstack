// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

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
import type { IGlobalCommandRequestClient } from './GlobalCommandRequestClient';
import type { IWorkspaceSession } from './WorkspaceSession';

/** A request resolved by the integration that owns Rush command parsing. @beta */
export type ResolvedDaemonRequest = IResolvedDaemonPhasedRequest | IResolvedDaemonGlobalRequest;

/** A resolver outcome that uses the existing typed phased-request contract. @beta */
export interface IResolvedDaemonPhasedRequest {
  readonly kind: 'phased';
  readonly request: IDaemonPhasedRequest;
}

/** A resolver outcome that uses the existing isolated global executor contract. @beta */
export interface IResolvedDaemonGlobalRequest {
  readonly executor: GlobalCommandExecutor;
  readonly kind: 'global';
}

/** Context supplied to an integration-owned request resolver. @beta */
export interface IResolveDaemonRequestOptions {
  /** Aborts when the request is cancelled, disconnected, or the host shuts down. */
  readonly abortSignal: AbortSignal;
  readonly envelope: IDaemonRequestEnvelope;
  readonly workspaceSession: IWorkspaceSession;
}

/** Resolves a validated wire envelope without coupling rushd to CLI parser internals. @beta */
export interface IDaemonRequestResolver {
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

/** Wire destination consumed by the shared request dispatcher. @internal */
export interface IDaemonRequestDispatchClient {
  readonly abortSignal: AbortSignal;
  readonly interactiveSession: IInteractiveRequestSession;
  readonly sessionId: string;
  readonly supportsRequestAdmission: boolean;
  getNextEventSequence(): number;
  writeEventAsync(event: IDaemonEventEnvelope): Promise<void>;
  writeLogChunkAsync(operationId: string, stream: 'stdout' | 'stderr', chunk: Uint8Array): Promise<void>;
  writeQueuePositionAsync(message: IDaemonRequestQueuePositionMessage): Promise<void>;
  writeResultAsync(result: IDaemonCommandResult | IDaemonPhasedRequestResult): Promise<void>;
  writeTerminalChunkAsync(stream: 'stdout' | 'stderr', chunk: Uint8Array): Promise<void>;
  writeTerminalPolicyAsync(result: IDaemonTerminalPolicyResult): Promise<void>;
}

/**
 * Shared resolver-backed integration between wire requests and the accumulated typed WS2 routers.
 *
 * @beta
 */
export class DaemonRequestDispatcher implements AsyncDisposable {
  readonly #globalRouter: GlobalCommandRequestRouter;
  readonly #phasedRouter: PhasedRequestRouter;
  readonly #resolver: IDaemonRequestResolver | undefined;
  readonly #workspaceSession: IWorkspaceSession;
  #disposePromise: Promise<void> | undefined;

  public constructor(workspaceSession: IWorkspaceSession, resolver?: IDaemonRequestResolver) {
    this.#workspaceSession = workspaceSession;
    this.#resolver = resolver;
    this.#globalRouter = new GlobalCommandRequestRouter(workspaceSession);
    this.#phasedRouter = new PhasedRequestRouter(workspaceSession);
  }

  public async dispatchAsync(
    envelope: IDaemonRequestEnvelope,
    client: IDaemonRequestDispatchClient
  ): Promise<void> {
    if (!this.#resolver) {
      throw new DaemonRequestDispatchError(
        'unsupported',
        'This daemon host has no command request integration configured.'
      );
    }
    const resolved: ResolvedDaemonRequest = await this.#resolver.resolveRequestAsync({
      abortSignal: client.abortSignal,
      envelope,
      workspaceSession: this.#workspaceSession
    });
    if (resolved.kind === 'phased') {
      validateResolvedPhasedRequest(envelope, resolved.request);
      await this.#phasedRouter.executeAsync(resolved.request, createPhasedClient(client));
      return;
    }
    const request: IResolvedGlobalCommandRequest = this.#globalRouter.resolveRequest({
      admission: envelope.admission,
      commandName: envelope.commandName,
      commandOrigin: envelope.commandOrigin,
      cwd: envelope.cwd,
      environment: envelope.environment,
      requestId: envelope.requestId,
      terminal: {
        ...envelope.terminal,
        columns: envelope.terminal.columns
      }
    });
    await this.#globalRouter.executeAsync(request, resolved.executor, createGlobalClient(client));
  }

  public [Symbol.asyncDispose](): Promise<void> {
    this.#disposePromise ??= this.#resolver?.[Symbol.asyncDispose]?.() ?? Promise.resolve();
    return this.#disposePromise;
  }
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
