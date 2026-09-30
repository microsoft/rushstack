// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type {
  IDaemonEventEnvelope,
  IDaemonPhasedRequestResult,
  IDaemonRequestQueuePositionMessage,
  IDaemonTerminalPolicyResult
} from '@rushstack/rush-daemon-protocol';

import type {
  IInteractiveRequestInputSink,
  IInteractiveRequestSession
} from './InteractiveRequestInputRouter';

/**
 * A client-scoped destination for one routed phased request.
 *
 * @remarks
 * The client must abort `abortSignal` when its request is cancelled or its connection closes. Writes are invoked
 * serially in engine order; each promise provides the destination's backpressure boundary.
 *
 * @beta
 */
export interface IPhasedRequestClient {
  /** Aborted by the transport when the request is cancelled or disconnected. */
  readonly abortSignal: AbortSignal;
  /** The request-scoped stdin/control lifecycle when one was registered by the transport integration. */
  readonly interactiveSession?: IInteractiveRequestSession;
  /** The integration-owned destination for stdin accepted by this phased request. */
  readonly interactiveInputSink?: IInteractiveRequestInputSink;
  /** The connection session identifier used in structured event envelopes. */
  readonly sessionId: string;
  /** Set only after negotiating request-admission protocol support with the client. */
  readonly supportsRequestAdmission?: boolean;

  /** Returns the next structured-event sequence number for this connection. */
  getNextEventSequence(): number;

  /** Writes one structured event through the client's backpressured destination. */
  writeEventAsync(event: IDaemonEventEnvelope): Promise<void>;

  /** Writes one operation-scoped output chunk through the client's backpressured destination. */
  writeLogChunkAsync(operationId: string, stream: 'stdout' | 'stderr', chunk: Uint8Array): Promise<void>;

  /** Signals that the client must execute this request in-process instead. */
  writeTerminalPolicyAsync(result: IDaemonTerminalPolicyResult): Promise<void>;

  /** Writes the final command result after every preceding event and log chunk has drained. */
  writeResultAsync(result: IDaemonPhasedRequestResult): Promise<void>;

  /** Writes the request's current one-based scheduler queue position. */
  writeQueuePositionAsync?(message: IDaemonRequestQueuePositionMessage): Promise<void>;

  /**
   * Tells the client that the request left every queue, if the client asked to be told. The daemon waits for the
   * write before it applies anything from the request. Hosts that omit it never tell the client.
   */
  writeRequestStartedAsync?(): Promise<void>;

  /**
   * Resolves once the daemon's other clients that are still connecting have sent their requests, or are not about
   * to send one. The wait is short and capped.
   *
   * @remarks
   * The router calls it before a batch of shared builds starts its input reconcile. A request that the daemon
   * receives before then can still join the batch, so a client that connected while the daemon was busy shares the
   * batch's iteration instead of waiting for it and reconciling again.
   */
  waitForConnectingClientsAsync?(): Promise<void>;
}
