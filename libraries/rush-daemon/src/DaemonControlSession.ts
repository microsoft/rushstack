// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { randomUUID } from 'node:crypto';

import {
  DAEMON_INTERACTIVE_IO_PROTOCOL_MINOR,
  DAEMON_PROTOCOL_VERSION,
  DAEMON_REQUEST_ADMISSION_PROTOCOL_MINOR,
  DAEMON_REQUEST_LIFECYCLE_PROTOCOL_MINOR,
  DaemonFrameType,
  DaemonProtocolError,
  decodeDaemonControlMessage,
  encodeDaemonControlMessage,
  negotiateDaemonHello
} from '@rushstack/rush-daemon-protocol';
import type {
  DaemonControlMessage,
  DaemonRequestRejectionCode,
  IDaemonErrorMessage,
  IDaemonFrame,
  IDaemonPongMessage,
  IDaemonRequestEnvelope
} from '@rushstack/rush-daemon-protocol';
import type { DaemonFrameConnection } from '@rushstack/rush-daemon-transport';

import { DaemonInteractiveConnection } from './DaemonInteractiveConnection';
import type { IDaemonInteractiveConnection } from './DaemonInteractiveConnection';
import { DaemonRequestDispatchError } from './DaemonRequestDispatcher';
import type { DaemonRequestDispatcher } from './DaemonRequestDispatcher';
import { DaemonWireRequestClient } from './DaemonWireRequestClient';
import {
  InteractiveInputRoutingError,
  isInteractiveRequestInputFailure
} from './InteractiveRequestInputRouter';
import type { IInteractiveRequestSession } from './InteractiveRequestInputRouter';
import { WorkspaceEngineRecreationRequiredError } from './WorkspaceEngineComponentFactory';

export interface IDaemonControlSessionOptions {
  readonly daemonVersion: string;
  readonly dispatcher: DaemonRequestDispatcher;
  readonly startedAtMs: number;
  readonly onInteractiveConnection?: (connection: IDaemonInteractiveConnection) => void;
  readonly onClosed: (session: DaemonControlSession, error: Error | undefined) => void;
  readonly onError: (error: Error) => void;
}

interface IRequestState {
  readonly abortController: AbortController;
  readonly client: DaemonWireRequestClient;
  completion: Promise<void>;
}

interface IClassifiedRejection {
  readonly code: DaemonRequestRejectionCode;
  readonly message: string;
}

const CLOSE_DRAIN_TIMEOUT_MS: number = 5000;

export class DaemonControlSession {
  readonly #connection: DaemonFrameConnection;
  readonly #interactiveConnection: DaemonInteractiveConnection;
  readonly #options: IDaemonControlSessionOptions;
  readonly #requestById: Map<string, IRequestState> = new Map();
  readonly #completedRequestIds: Set<string> = new Set();
  readonly #closedPromise: Promise<void>;
  readonly #resolveClosed: () => void;
  #closePromise: Promise<void> | undefined;
  #connectionClosed: boolean = false;
  #handshakeComplete: boolean = false;
  #isClosing: boolean = false;
  #peerSupportsInteractiveProtocol: boolean = false;
  #peerSupportsRequestAdmission: boolean = false;
  #peerSupportsRequestLifecycle: boolean = false;
  #sendQueue: Promise<void> = Promise.resolve();
  #sessionId: string | undefined;
  #subscribed: boolean = false;

  public constructor(connection: DaemonFrameConnection, options: IDaemonControlSessionOptions) {
    this.#connection = connection;
    this.#options = options;
    const closed: ReturnType<typeof createDeferred> = createDeferred();
    this.#closedPromise = closed.promise;
    this.#resolveClosed = closed.resolve;
    this.#interactiveConnection = new DaemonInteractiveConnection((message: DaemonControlMessage) =>
      this.#enqueueControlAsync(message)
    );
    connection.onFrame((frame: IDaemonFrame) => this.#handleFrameSafelyAsync(frame));
    connection.onClosed((error: Error | undefined) => {
      void this.#handleConnectionClosedAsync(error);
    });
    options.onInteractiveConnection?.(this.#interactiveConnection);
  }

  public closeAsync(): Promise<void> {
    this.#closePromise ??= this.#closeOnceAsync();
    return this.#closePromise;
  }

  async #handleFrameSafelyAsync(frame: IDaemonFrame): Promise<void> {
    try {
      await this.#onFrameAsync(frame);
    } catch (error) {
      await this.#handleProtocolFailureAsync(normalizeProtocolError(error));
    }
  }

  async #onFrameAsync(frame: IDaemonFrame): Promise<void> {
    if (this.#isClosing) {
      throw new DaemonProtocolError('malformedControlMessage', 'The daemon session is closing.');
    }
    if (frame.kind === DaemonFrameType.stdin) {
      this.#assertHandshakeComplete();
      try {
        await this.#interactiveConnection.routeStdinFrameAsync(frame.payload);
      } catch (error) {
        if (
          !isInteractiveRequestInputFailure(error) &&
          !(error instanceof InteractiveInputRoutingError && error.code === 'completedRequest')
        ) {
          throw error;
        }
      }
      return;
    }
    if (frame.kind !== DaemonFrameType.controlJson) {
      throw new DaemonProtocolError(
        'malformedControlMessage',
        'A daemon control connection only accepts control and stdin frames.'
      );
    }
    const message: DaemonControlMessage = decodeDaemonControlMessage(frame.payload);
    if (!this.#handshakeComplete) {
      this.#handleHello(message);
      return;
    }
    await this.#handleEstablishedControlAsync(message);
  }

  async #handleEstablishedControlAsync(message: DaemonControlMessage): Promise<void> {
    if (this.#interactiveConnection.handleControlMessage(message)) return;
    switch (message.kind) {
      case 'subscribe':
        this.#handleSubscribe(message.payload);
        return;
      case 'ping':
        this.#send(this.#createPong());
        return;
      case 'requestStart':
        this.#startRequest(message.payload);
        return;
      case 'requestCancel':
        this.#cancelRequest(message.payload.requestId);
        return;
      default:
        throw new DaemonProtocolError(
          'malformedControlMessage',
          `Control message "${message.kind}" is not valid in this daemon host state.`
        );
    }
  }

  #handleHello(message: DaemonControlMessage): void {
    if (message.kind !== 'hello') {
      throw new DaemonProtocolError(
        'malformedControlMessage',
        'The first control message on a connection must be hello.'
      );
    }
    const outcome: ReturnType<typeof negotiateDaemonHello> = negotiateDaemonHello(
      message,
      DAEMON_PROTOCOL_VERSION,
      randomUUID()
    );
    if (!outcome.accepted) {
      this.#send(
        { kind: 'error', payload: { code: outcome.error.code, message: outcome.error.message } },
        true
      );
      return;
    }
    this.#handshakeComplete = true;
    this.#sessionId = outcome.ack.payload.sessionId;
    const peerMinor: number = message.payload.protocolVersion.minor;
    this.#peerSupportsInteractiveProtocol = peerMinor >= DAEMON_INTERACTIVE_IO_PROTOCOL_MINOR;
    this.#peerSupportsRequestAdmission = peerMinor >= DAEMON_REQUEST_ADMISSION_PROTOCOL_MINOR;
    this.#peerSupportsRequestLifecycle = peerMinor >= DAEMON_REQUEST_LIFECYCLE_PROTOCOL_MINOR;
    this.#send(outcome.ack);
  }

  #handleSubscribe(payload: Extract<DaemonControlMessage, { kind: 'subscribe' }>['payload']): void {
    if (this.#subscribed) {
      throw new DaemonProtocolError('malformedControlMessage', 'A daemon session may subscribe only once.');
    }
    this.#subscribed = true;
    this.#peerSupportsInteractiveProtocol =
      this.#peerSupportsInteractiveProtocol && payload.supportsInteractiveIO === true;
    this.#peerSupportsRequestAdmission =
      this.#peerSupportsRequestAdmission && payload.supportsRequestAdmission === true;
    this.#peerSupportsRequestLifecycle =
      this.#peerSupportsRequestLifecycle && payload.supportsRequestLifecycle === true;
    this.#interactiveConnection.setEnabled(this.#peerSupportsInteractiveProtocol);
  }

  #startRequest(envelope: IDaemonRequestEnvelope): void {
    this.#assertRequestLifecycleReady();
    const requestId: string = envelope.requestId;
    if (this.#requestById.has(requestId) || this.#completedRequestIds.has(requestId)) {
      throw new DaemonProtocolError(
        'malformedControlMessage',
        `Request id "${requestId}" has already been used on this connection.`
      );
    }
    if (this.#requestById.size > 0) {
      this.#completedRequestIds.add(requestId);
      this.#send({
        kind: 'requestRejected',
        payload: {
          code: 'invalidRequest',
          message: 'A daemon control connection may run only one request at a time.',
          requestId
        }
      });
      return;
    }
    const abortController: AbortController = new AbortController();
    const interactiveSession: IInteractiveRequestSession = this.#interactiveConnection.registerRequest({
      abortSignal: abortController.signal,
      acceptsStdin: envelope.terminal.acceptsStdin === true,
      onFailure: (error: Error) => abortController.abort(error),
      requestId
    });
    const sessionId: string = this.#sessionId!;
    const client: DaemonWireRequestClient = new DaemonWireRequestClient({
      abortSignal: abortController.signal,
      interactiveSession,
      requestId,
      sendControlAsync: (message: DaemonControlMessage) => this.#enqueueControlAsync(message),
      sendFrameAsync: (frame: IDaemonFrame) => this.#enqueueFrameAsync(frame),
      sessionId,
      supportsRequestAdmission: this.#peerSupportsRequestAdmission
    });
    const state: IRequestState = { abortController, client, completion: Promise.resolve() };
    this.#requestById.set(requestId, state);
    state.completion = Promise.resolve().then(() => this.#dispatchRequestAsync(envelope, state));
  }

  #cancelRequest(requestId: string): void {
    const state: IRequestState | undefined = this.#requestById.get(requestId);
    if (!state) {
      const kind: string = this.#completedRequestIds.has(requestId) ? 'completed' : 'unknown';
      throw new DaemonProtocolError(
        'malformedControlMessage',
        `Cannot cancel ${kind} request "${requestId}".`
      );
    }
    state.abortController.abort(new Error(`Request "${requestId}" was cancelled by the client.`));
  }

  async #dispatchRequestAsync(envelope: IDaemonRequestEnvelope, state: IRequestState): Promise<void> {
    let dispatchError: unknown;
    try {
      await this.#options.dispatcher.dispatchAsync(envelope, state.client);
      if (!state.client.terminalOutcomeSent) {
        throw new DaemonRequestDispatchError(
          'routingFailed',
          'The request integration completed without a terminal outcome.'
        );
      }
    } catch (error) {
      dispatchError = error;
    }
    try {
      await state.client.interactiveSession.finishAsync();
    } catch (cleanupError) {
      dispatchError = combineErrors(dispatchError, cleanupError);
    }
    if (dispatchError !== undefined && !state.client.terminalOutcomeSent && !this.#connectionClosed) {
      const rejection: IClassifiedRejection = classifyRejection(dispatchError);
      await state.client.writeRejectionAsync(rejection.code, rejection.message);
    }
    this.#completeRequest(envelope.requestId, state);
  }

  #completeRequest(requestId: string, state: IRequestState): void {
    if (this.#requestById.get(requestId) !== state) return;
    this.#requestById.delete(requestId);
    this.#completedRequestIds.add(requestId);
  }

  #assertHandshakeComplete(): void {
    if (!this.#handshakeComplete) {
      throw new DaemonProtocolError(
        'malformedControlMessage',
        'The first frame on a connection must be a hello control message.'
      );
    }
  }

  #assertRequestLifecycleReady(): void {
    if (!this.#subscribed || !this.#peerSupportsRequestLifecycle) {
      throw new DaemonProtocolError(
        'malformedControlMessage',
        'Request execution requires a subscribed request-lifecycle capable client.'
      );
    }
  }

  #createPong(): IDaemonPongMessage {
    return {
      kind: 'pong',
      payload: {
        daemonVersion: this.#options.daemonVersion,
        protocolVersion: DAEMON_PROTOCOL_VERSION,
        uptimeMs: Date.now() - this.#options.startedAtMs
      }
    };
  }

  #send(message: DaemonControlMessage, closeAfterSend: boolean = false): void {
    void this.#enqueueControlAsync(message, closeAfterSend).catch((error: unknown) =>
      this.#handleSendFailureAsync(error)
    );
  }

  #enqueueControlAsync(
    message: DaemonControlMessage,
    closeAfterSend: boolean = false
  ): Promise<void> {
    return this.#enqueueFrameAsync(
      { kind: DaemonFrameType.controlJson, payload: encodeDaemonControlMessage(message) },
      closeAfterSend
    );
  }

  #enqueueFrameAsync(frame: IDaemonFrame, closeAfterSend: boolean = false): Promise<void> {
    const sendPromise: Promise<void> = this.#sendQueue
      .then(() => this.#connection.sendFrameAsync(frame))
      .then(() => (closeAfterSend ? this.#connection.closeAsync() : undefined));
    this.#sendQueue = sendPromise.catch(() => undefined);
    return sendPromise;
  }

  async #handleProtocolFailureAsync(error: DaemonProtocolError): Promise<void> {
    this.#options.onError(error);
    this.#markClosing(error);
    const message: IDaemonErrorMessage = {
      kind: 'error',
      payload: { code: error.code, message: error.message }
    };
    const sendPromise: Promise<void> = this.#enqueueControlAsync(message);
    if (!(await settlesWithinAsync(sendPromise, CLOSE_DRAIN_TIMEOUT_MS))) {
      this.#connection.abort(error);
    }
    try {
      await sendPromise;
    } catch {
      // The transport failure is reported by the close path.
    }
    await this.#closeWithReasonAsync(error);
  }

  async #handleSendFailureAsync(error: unknown): Promise<void> {
    const normalizedError: Error = normalizeError(error);
    this.#options.onError(normalizedError);
    await this.#closeWithReasonAsync(normalizedError);
  }

  #closeWithReasonAsync(reason: Error): Promise<void> {
    this.#markClosing(reason);
    this.#closePromise ??= this.#closeOnceAsync();
    return this.#closePromise;
  }

  #markClosing(reason: Error): void {
    if (this.#isClosing) return;
    this.#isClosing = true;
    this.#interactiveConnection.close(reason);
    for (const state of this.#requestById.values()) {
      state.abortController.abort(reason);
    }
  }

  async #closeOnceAsync(): Promise<void> {
    const closeReason: Error = new Error('The daemon control session is closing.');
    this.#markClosing(closeReason);
    const drainPromise: Promise<void> = Promise.all([
      Promise.allSettled(
        Array.from(this.#requestById.values(), (state: IRequestState) => state.completion)
      ),
      this.#sendQueue
    ]).then(() => undefined);
    if (!(await settlesWithinAsync(drainPromise, CLOSE_DRAIN_TIMEOUT_MS))) {
      this.#connection.abort(closeReason);
    }
    await drainPromise;
    if (!this.#connectionClosed) await this.#connection.closeAsync();
    await this.#closedPromise;
  }

  async #handleConnectionClosedAsync(error: Error | undefined): Promise<void> {
    if (this.#connectionClosed) return;
    this.#connectionClosed = true;
    this.#markClosing(error ?? new Error('The daemon client connection closed.'));
    const settlements: PromiseSettledResult<void>[] = await Promise.allSettled(
      Array.from(this.#requestById.values(), (state: IRequestState) => state.completion)
    );
    const cleanupErrors: Error[] = settlements
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map((result: PromiseRejectedResult) => normalizeError(result.reason));
    const finalError: Error | undefined = combineCloseErrors(error, cleanupErrors);
    if (cleanupErrors.length > 0) this.#options.onError(finalError!);
    this.#options.onClosed(this, finalError);
    this.#resolveClosed();
  }

}

function createDeferred(): { promise: Promise<void>; resolve: () => void } {
  let resolvePromise: () => void = () => undefined;
  const promise: Promise<void> = new Promise((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

function normalizeProtocolError(error: unknown): DaemonProtocolError {
  if (error instanceof DaemonProtocolError) return error;
  return new DaemonProtocolError('malformedControlMessage', normalizeError(error).message, {
    cause: error
  });
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function combineErrors(primary: unknown, cleanup: unknown): unknown {
  if (primary === undefined) return cleanup;
  return new AggregateError([primary, cleanup], 'The request failed and could not clean up.');
}

function classifyRejection(error: unknown): IClassifiedRejection {
  if (error instanceof WorkspaceEngineRecreationRequiredError) {
    return { code: 'workspaceRecreationRequired', message: error.message };
  }
  if (error instanceof DaemonRequestDispatchError) {
    return { code: error.code, message: error.message };
  }
  return { code: 'routingFailed', message: normalizeError(error).message };
}

function combineCloseErrors(error: Error | undefined, cleanupErrors: ReadonlyArray<Error>): Error | undefined {
  if (cleanupErrors.length === 0) return error;
  return new AggregateError(
    error ? [error, ...cleanupErrors] : cleanupErrors,
    'The daemon connection closed with request cleanup failures.'
  );
}

async function settlesWithinAsync(promise: Promise<void>, timeoutMs: number): Promise<boolean> {
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise: Promise<boolean> = new Promise((resolve) => {
    timeout = setTimeout(() => resolve(false), timeoutMs);
    timeout.unref();
  });
  const settled: boolean = await Promise.race([promise.then(() => true), timeoutPromise]);
  if (timeout) clearTimeout(timeout);
  return settled;
}
