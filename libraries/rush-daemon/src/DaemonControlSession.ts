// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { randomUUID } from 'node:crypto';

import {
  DAEMON_INTERACTIVE_IO_PROTOCOL_MINOR,
  DAEMON_INPUT_LIFECYCLE_PROTOCOL_MINOR,
  DAEMON_LIFECYCLE_PROTOCOL_MINOR,
  DAEMON_PROTOCOL_VERSION,
  DAEMON_REQUEST_ADMISSION_PROTOCOL_MINOR,
  DAEMON_REQUEST_LIFECYCLE_PROTOCOL_MINOR,
  DAEMON_REQUEST_STARTED_PROTOCOL_MINOR,
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
  IDaemonInstallationChange,
  IDaemonPongMessage,
  IDaemonRequestEnvelope,
  IDaemonWorkspaceStatus
} from '@rushstack/rush-daemon-protocol';
import { DaemonTransportError, DaemonTransportErrorCode } from '@rushstack/rush-daemon-transport';
import type { DaemonFrameConnection } from '@rushstack/rush-daemon-transport';

import { createGlobalCommandResult } from './CommandResultPolicy';
import type { ConnectingClientTracker, IConnectingClient } from './ConnectingClientTracker';
import { DaemonInteractiveConnection } from './DaemonInteractiveConnection';
import type { IDaemonInteractiveConnection } from './DaemonInteractiveConnection';
import { MAX_REQUESTS_PER_CONNECTION } from './DaemonConnectionLimits';
import { DaemonRequestDispatchError } from './DaemonRequestDispatcher';
import { DaemonRequestUsageError } from './DaemonRequestUsageError';
import type { DaemonRequestDispatcher } from './DaemonRequestDispatcher';
import { DaemonShutdownError } from './DaemonShutdownError';
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
  readonly onRequestStarted?: () => () => void;
  readonly onShutdownRequested: () => void;
  /** Counts requests running on every connection, reported in the shutdown acknowledgement. */
  readonly getActiveRequestCount?: () => number;
  /** Reads the status that `pong` reports, without the warm set when the ping asked to leave it out. */
  readonly getWorkspaceStatus?: (omitWarmSet: boolean) => IDaemonWorkspaceStatus;
  /** Reports a removed or replaced installation in `pong`. */
  readonly checkInstallation?: () => IDaemonInstallationChange | undefined;
  /**
   * Receives a message for the daemon log for each rejected request, and for each reply that could not reach a
   * client because the client went away.
   */
  readonly onLog?: (message: string) => void;
  /** Tracks this connection until it sends its first request or starts closing. */
  readonly connectingClients?: ConnectingClientTracker;
}

interface IRequestState {
  readonly abortController: AbortController;
  readonly client: DaemonWireRequestClient;
  completion: Promise<void>;
  /** The quoted command line, for reports about requests that did not finish. */
  readonly description: string;
  readonly startedAtMs: number;
}

interface IClassifiedRejection {
  readonly code: DaemonRequestRejectionCode;
  readonly message: string;
}

const CLOSE_DRAIN_TIMEOUT_MS: number = 5000;
// How long the typed results for requests that did not stop get to reach their clients before the connection is
// aborted.
const SHUTDOWN_RESULT_SEND_TIMEOUT_MS: number = 1000;
const MAX_REQUEST_DESCRIPTION_LENGTH: number = 100;
const MS_PER_SECOND: number = 1000;

export class DaemonControlSession {
  readonly #connection: DaemonFrameConnection;
  readonly #interactiveConnection: DaemonInteractiveConnection;
  readonly #options: IDaemonControlSessionOptions;
  readonly #requestById: Map<string, IRequestState> = new Map();
  readonly #completedRequestIds: Set<string> = new Set();
  readonly #closedPromise: Promise<void>;
  readonly #resolveClosed: () => void;
  readonly #connectingClient: IConnectingClient | undefined;
  #clientGone: boolean = false;
  #closePromise: Promise<void> | undefined;
  #connectionClosed: boolean = false;
  #handshakeComplete: boolean = false;
  #isClosing: boolean = false;
  #nextEventSequence: number = 1;
  #peerSupportsInteractiveProtocol: boolean = false;
  #peerSupportsInputLifecycle: boolean = false;
  #peerSupportsDaemonLifecycle: boolean = false;
  #peerSupportsRequestAdmission: boolean = false;
  #peerSupportsRequestLifecycle: boolean = false;
  #peerSupportsRequestStarted: boolean = false;
  #sendQueue: Promise<void> = Promise.resolve();
  #sessionId: string | undefined;
  #subscribed: boolean = false;

  public constructor(connection: DaemonFrameConnection, options: IDaemonControlSessionOptions) {
    this.#connection = connection;
    this.#options = options;
    this.#connectingClient = options.connectingClients?.add();
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

  public closeAsync(drainRequests: boolean = false, reason?: DaemonShutdownError): Promise<void> {
    // Unlike a disconnect, closing the session also stops the work that a request still runs after it sent its
    // result (a failed build that returned early). No client waits for a restart result from such a request.
    for (const state of this.#requestById.values()) {
      if (state.client.terminalOutcomeSent) {
        state.abortController.abort(reason ?? new Error('The daemon control session is closing.'));
      }
    }
    this.#closePromise ??= this.#closeOnceAsync(drainRequests, reason);
    return this.#closePromise;
  }

  public get activeRequestCount(): number {
    return this.#requestById.size;
  }

  /** Describes each request that has not finished, such as `"build -t a" (running for 12.3 s)`. */
  public describeActiveRequests(): string[] {
    const nowMs: number = Date.now();
    return Array.from(this.#requestById.values(), (state: IRequestState) => {
      const runningSeconds: string = ((nowMs - state.startedAtMs) / MS_PER_SECOND).toFixed(1);
      return `${state.description} (running for ${runningSeconds} s)`;
    });
  }

  async #handleFrameSafelyAsync(frame: IDaemonFrame): Promise<void> {
    this.#connectingClient?.touch();
    try {
      await this.#onFrameAsync(frame);
    } catch (error) {
      await this.#handleProtocolFailureAsync(normalizeProtocolError(error));
    }
  }

  async #onFrameAsync(frame: IDaemonFrame): Promise<void> {
    if (this.#isClosing) {
      // A client may ping at any time while its request runs. The request's own result, or the closed connection,
      // answers it; an error sent now could reach the client before that result.
      if (isPingFrame(frame)) return;
      throw new DaemonProtocolError('malformedControlMessage', 'The daemon session is closing.');
    }
    if (frame.kind === DaemonFrameType.stdin) {
      this.#assertHandshakeComplete();
      void this.#completeInputAsync(this.#interactiveConnection.routeStdinFrameAsync(frame.payload));
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

  async #completeInputAsync(inputPromise: Promise<void>): Promise<void> {
    try {
      await inputPromise;
    } catch (error) {
      if (
        !isInteractiveRequestInputFailure(error) &&
        !(error instanceof InteractiveInputRoutingError && error.code === 'completedRequest')
      ) {
        await this.#handleProtocolFailureAsync(normalizeProtocolError(error));
      }
    }
  }

  async #handleEstablishedControlAsync(message: DaemonControlMessage): Promise<void> {
    if (this.#interactiveConnection.handleControlMessage(message)) return;
    switch (message.kind) {
      case 'subscribe':
        this.#handleSubscribe(message.payload);
        return;
      case 'ping':
        this.#send(this.#createPong(message.payload.omitWarmSet === true));
        return;
      case 'shutdown':
        await this.#shutdownHostAsync();
        return;
      case 'requestStart':
        this.#startRequest(message.payload);
        return;
      case 'requestCancel':
        this.#cancelRequest(message.payload.requestId);
        return;
      case 'stdinEnd':
        void this.#completeInputAsync(
          this.#interactiveConnection.routeStdinEndAsync(message.payload.requestId)
        );
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
    this.#peerSupportsInputLifecycle = peerMinor >= DAEMON_INPUT_LIFECYCLE_PROTOCOL_MINOR;
    this.#peerSupportsDaemonLifecycle = peerMinor >= DAEMON_LIFECYCLE_PROTOCOL_MINOR;
    this.#peerSupportsRequestAdmission = peerMinor >= DAEMON_REQUEST_ADMISSION_PROTOCOL_MINOR;
    this.#peerSupportsRequestLifecycle = peerMinor >= DAEMON_REQUEST_LIFECYCLE_PROTOCOL_MINOR;
    this.#peerSupportsRequestStarted = peerMinor >= DAEMON_REQUEST_STARTED_PROTOCOL_MINOR;
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
    this.#peerSupportsRequestStarted =
      this.#peerSupportsRequestStarted && payload.supportsRequestStarted === true;
    this.#peerSupportsInputLifecycle =
      this.#peerSupportsInputLifecycle && payload.supportsInputLifecycle === true;
    this.#interactiveConnection.setEnabled(
      this.#peerSupportsInteractiveProtocol,
      this.#peerSupportsInputLifecycle
    );
  }

  async #shutdownHostAsync(): Promise<void> {
    if (!this.#peerSupportsDaemonLifecycle) {
      throw new DaemonProtocolError(
        'malformedControlMessage',
        'Daemon shutdown requires a lifecycle-capable protocol version.'
      );
    }
    const activeRequests: number | undefined = this.#options.getActiveRequestCount?.();
    // Queue the acknowledgement, then begin shutdown synchronously so the reported count is the set that
    // shutdown aborts; closing drains the send queue, so the acknowledgement is still delivered first.
    const ackPromise: Promise<void> = this.#enqueueControlAsync({
      kind: 'shutdownAck',
      payload: activeRequests === undefined ? {} : { activeRequests }
    });
    this.#options.onShutdownRequested();
    try {
      await ackPromise;
    } catch (error) {
      if (!this.#isClientGone(error)) throw error;
      await this.#handleSendFailureAsync(error, 'the shutdownAck');
    }
  }

  #startRequest(envelope: IDaemonRequestEnvelope): void {
    const receivedTimeMs: number = performance.now();
    this.#assertRequestLifecycleReady();
    const requestId: string = envelope.requestId;
    if (this.#requestById.has(requestId) || this.#completedRequestIds.has(requestId)) {
      throw new DaemonProtocolError(
        'malformedControlMessage',
        `Request id "${requestId}" has already been used on this connection.`
      );
    }
    if (this.#requestById.size + this.#completedRequestIds.size >= MAX_REQUESTS_PER_CONNECTION) {
      throw new DaemonProtocolError(
        'malformedControlMessage',
        `A daemon control connection accepts at most ${MAX_REQUESTS_PER_CONNECTION} distinct request ids; reconnect before starting request "${requestId}".`
      );
    }
    if (this.#requestById.size > 0) {
      this.#interactiveConnection.markRequestCompleted(requestId);
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
    const connectingClients: ConnectingClientTracker | undefined = this.#options.connectingClients;
    const client: DaemonWireRequestClient = new DaemonWireRequestClient({
      abortSignal: abortController.signal,
      getNextEventSequence: () => this.#getNextEventSequence(),
      interactiveSession,
      receivedTimeMs,
      requestId,
      sendControlAsync: (message: DaemonControlMessage) => this.#enqueueControlAsync(message),
      sendFrameAsync: (frame: IDaemonFrame) => this.#enqueueFrameAsync(frame),
      sessionId,
      supportsRequestAdmission: this.#peerSupportsRequestAdmission,
      supportsRequestStarted: this.#peerSupportsRequestStarted,
      waitForConnectingClientsAsync: connectingClients && (() => connectingClients.waitAsync())
    });
    const state: IRequestState = {
      abortController,
      client,
      completion: Promise.resolve(),
      description: describeRequest(envelope),
      startedAtMs: Date.now()
    };
    this.#requestById.set(requestId, state);
    const releaseActivity: (() => void) | undefined = this.#options.onRequestStarted?.();
    state.completion = Promise.resolve()
      .then(() => this.#dispatchRequestAsync(envelope, state))
      .finally(() => {
        this.#completeRequest(requestId, state);
        releaseActivity?.();
      });
    void state.completion.catch((error: unknown) =>
      this.#handleSendFailureAsync(error, `the result of ${state.description}`)
    );
    // The request has its receipt time, so a batch that waits for this connection can now close.
    this.#connectingClient?.settle();
  }

  #getNextEventSequence(): number {
    const sequence: number = this.#nextEventSequence;
    this.#nextEventSequence = sequence + 1;
    return sequence;
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
      if (dispatchError instanceof DaemonRequestUsageError) {
        // Native Rush reports an invalid command line and exits, so the client must not run it in-process.
        await state.client.writeResultAsync({
          requestId: envelope.requestId,
          exitCode: dispatchError.exitCode,
          outcome: 'failure',
          aborted: state.abortController.signal.aborted,
          errorMessage: dispatchError.message
        });
        return;
      }
      const rejection: IClassifiedRejection = classifyRejection(dispatchError);
      // The client prints only the message; keep the rest where `rush-client daemon logs` finds it.
      this.#options.onLog?.(
        `rushd: rejected request ${envelope.requestId} (${rejection.code}): ${
          rejection.code === 'routingFailed' ? describeError(dispatchError) : rejection.message
        }`
      );
      await state.client.writeRejectionAsync(rejection.code, rejection.message);
    }
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

  #createPong(omitWarmSet: boolean): IDaemonPongMessage {
    return {
      kind: 'pong',
      payload: {
        daemonVersion: this.#options.daemonVersion,
        protocolVersion: DAEMON_PROTOCOL_VERSION,
        pid: process.pid,
        residentMemoryBytes: process.memoryUsage().rss,
        workspace: this.#options.getWorkspaceStatus?.(omitWarmSet),
        installationChange: this.#options.checkInstallation?.(),
        uptimeMs: Date.now() - this.#options.startedAtMs
      }
    };
  }

  #send(message: DaemonControlMessage, closeAfterSend: boolean = false): void {
    void this.#enqueueControlAsync(message, closeAfterSend).catch((error: unknown) =>
      this.#handleSendFailureAsync(error, `the ${message.kind}`)
    );
  }

  #enqueueControlAsync(message: DaemonControlMessage, closeAfterSend: boolean = false): Promise<void> {
    return this.#enqueueFrameAsync(
      { kind: DaemonFrameType.controlJson, payload: encodeDaemonControlMessage(message) },
      closeAfterSend
    );
  }

  #enqueueFrameAsync(frame: IDaemonFrame, closeAfterSend: boolean = false): Promise<void> {
    const sendPromise: Promise<void> = this.#sendQueue
      .then(() => this.#connection.sendFrameAsync(frame))
      .then(() => {
        // Before its request, a client waits for each reply. A large reply (the pong carries the warm set status)
        // finishes writing only when the event loop runs, so a busy daemon can write it long after the client's
        // last frame. Its client must not count as idle before it could read the reply.
        this.#connectingClient?.touch();
        return closeAfterSend ? this.#connection.closeAsync() : undefined;
      });
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

  /** Reports a failed send and closes the session. `reply` names what was lost, such as `the pong`. */
  async #handleSendFailureAsync(error: unknown, reply: string): Promise<void> {
    const normalizedError: Error = normalizeError(error);
    if (this.#isClientGone(error)) {
      // Not a daemon failure, so one line instead of a stack.
      this.#options.onLog?.(
        `rushd: a client went away before its reply; dropped ${reply} (${(error as Error).message})`
      );
    } else {
      this.#options.onError(normalizedError);
    }
    await this.#closeWithReasonAsync(normalizedError);
  }

  /**
   * Whether an error only means that the client went away: its connection failed with EPIPE or ECONNRESET, or had
   * already failed so before this send found it closed. A call that sees EPIPE or ECONNRESET remembers it for
   * those later sends. Pass the error as thrown: normalizing can wrap an error from another realm, such as a
   * socket error under Jest, and drop its code.
   */
  #isClientGone(error: unknown): boolean {
    if (isClientGoneError(error)) {
      this.#clientGone = true;
      return true;
    }
    return (
      this.#clientGone &&
      error instanceof DaemonTransportError &&
      error.code === DaemonTransportErrorCode.transportClosed
    );
  }

  #closeWithReasonAsync(reason: Error): Promise<void> {
    this.#markClosing(reason);
    this.#closePromise ??= this.#closeOnceAsync();
    return this.#closePromise;
  }

  #markClosing(reason: Error, keepFinishedRequests: boolean = false): void {
    if (this.#isClosing) return;
    this.#isClosing = true;
    this.#connectingClient?.settle();
    this.#interactiveConnection.close(reason);
    for (const state of this.#requestById.values()) {
      if (!keepFinishedRequests || !state.client.terminalOutcomeSent) {
        state.abortController.abort(reason);
      }
    }
  }

  async #closeOnceAsync(drainRequests: boolean = false, reason?: DaemonShutdownError): Promise<void> {
    const closeReason: Error = reason ?? new Error('The daemon control session is closing.');
    if (drainRequests) {
      const pending: Promise<PromiseSettledResult<void>[]> = Promise.allSettled(
        Array.from(this.#requestById.values(), (state: IRequestState) => state.completion)
      );
      // Lifecycle admission has stopped execution; let accepted requests receive their typed restart result.
      if (
        !(await settlesWithinAsync(
          pending.then(() => undefined),
          CLOSE_DRAIN_TIMEOUT_MS
        ))
      ) {
        await this.#abortConnectionAsync(closeReason);
      }
      await pending;
    }
    this.#markClosing(closeReason);
    const drainPromise: Promise<void> = Promise.all([
      Promise.allSettled(Array.from(this.#requestById.values(), (state: IRequestState) => state.completion)),
      this.#sendQueue
    ]).then(() => undefined);
    if (!(await settlesWithinAsync(drainPromise, CLOSE_DRAIN_TIMEOUT_MS))) {
      await this.#abortConnectionAsync(closeReason);
    }
    await drainPromise;
    if (!this.#connectionClosed) await this.#connection.closeAsync();
    await this.#closedPromise;
  }

  /**
   * Aborts a connection whose requests did not finish in time. When the daemon is shutting down, each request that
   * has no terminal outcome yet first gets a typed result that carries the shutdown's reason, so that its client
   * reports that instead of a lost connection. The request's own late result is then refused.
   */
  async #abortConnectionAsync(reason: Error): Promise<void> {
    if (reason instanceof DaemonShutdownError && !this.#connectionClosed) {
      const writes: Promise<void>[] = [];
      for (const [requestId, state] of this.#requestById) {
        if (!state.client.terminalOutcomeSent) {
          writes.push(writeShutdownResultAsync(requestId, state, reason));
        }
      }
      await settlesWithinAsync(
        Promise.allSettled(writes).then(() => undefined),
        SHUTDOWN_RESULT_SEND_TIMEOUT_MS
      );
    }
    this.#connection.abort(reason);
  }

  async #handleConnectionClosedAsync(error: Error | undefined): Promise<void> {
    if (this.#connectionClosed) return;
    this.#connectionClosed = true;
    // A client that went away is not a daemon failure. Each reply that it missed is logged when its send fails.
    const closeError: Error | undefined = error && this.#isClientGone(error) ? undefined : error;
    // A client that disconnects after its result does not stop the work that its request still runs.
    this.#markClosing(error ?? new Error('The daemon client connection closed.'), true);
    const settlements: PromiseSettledResult<void>[] = await Promise.allSettled(
      Array.from(this.#requestById.values(), (state: IRequestState) => state.completion)
    );
    const cleanupErrors: Error[] = settlements
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .filter((result: PromiseRejectedResult) => !this.#isClientGone(result.reason))
      .map((result: PromiseRejectedResult) => normalizeError(result.reason));
    const finalError: Error | undefined = combineCloseErrors(closeError, cleanupErrors);
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

function describeRequest(envelope: IDaemonRequestEnvelope): string {
  const command: string = envelope.argv.length > 0 ? envelope.argv.join(' ') : envelope.commandName;
  return command.length > MAX_REQUEST_DESCRIPTION_LENGTH
    ? `"${command.slice(0, MAX_REQUEST_DESCRIPTION_LENGTH - 1)}…"`
    : `"${command}"`;
}

function isPingFrame(frame: IDaemonFrame): boolean {
  return (
    frame.kind === DaemonFrameType.controlJson && decodeDaemonControlMessage(frame.payload).kind === 'ping'
  );
}

function writeShutdownResultAsync(
  requestId: string,
  state: IRequestState,
  reason: DaemonShutdownError
): Promise<void> {
  try {
    // The result that a router writes for a request that the shutdown aborted.
    return state.client.writeResultAsync(
      createGlobalCommandResult({ aborted: true, error: reason, exitCode: undefined, requestId })
    );
  } catch (error) {
    return Promise.reject(error);
  }
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

/** Whether a connection error means that the client has closed its end, so that nothing more can reach it. */
function isClientGoneError(error: unknown): boolean {
  const code: unknown = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === 'EPIPE' || code === 'ECONNRESET';
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

function describeError(error: unknown): string {
  const normalized: Error = normalizeError(error);
  return normalized.stack ?? normalized.message;
}

function combineCloseErrors(
  error: Error | undefined,
  cleanupErrors: ReadonlyArray<Error>
): Error | undefined {
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
  const settled: boolean = await Promise.race([
    promise.then(
      () => true,
      () => true
    ),
    timeoutPromise
  ]);
  if (timeout) clearTimeout(timeout);
  return settled;
}
