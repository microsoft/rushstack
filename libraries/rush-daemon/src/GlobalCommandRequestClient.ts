// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type {
  IDaemonCommandResult,
  IDaemonRequestQueuePositionMessage,
  IDaemonTerminalPolicyResult
} from '@rushstack/rush-daemon-protocol';

import type { IInteractiveRequestSession } from './InteractiveRequestInputRouter';

/**
 * A client-scoped destination for one global command request.
 *
 * @remarks
 * The client must abort `abortSignal` when its request is cancelled or its connection closes. Terminal writes are
 * serialized in command order, and each promise provides the destination's backpressure boundary.
 *
 * @beta
 */
export interface IGlobalCommandRequestClient {
  /** Aborted by the transport when the request is cancelled or disconnected. */
  readonly abortSignal: AbortSignal;
  /** The request-scoped stdin/control lifecycle when one was registered by the transport integration. */
  readonly interactiveSession?: IInteractiveRequestSession;
  /** Set only after negotiating request-admission protocol support with the client. */
  readonly supportsRequestAdmission?: boolean;

  /** Writes one request-scoped terminal chunk through the client's backpressured destination. */
  writeTerminalChunkAsync(stream: 'stdout' | 'stderr', chunk: Uint8Array): Promise<void>;

  /** Signals that the client must execute this request in-process instead. */
  writeTerminalPolicyAsync(result: IDaemonTerminalPolicyResult): Promise<void>;

  /** Writes the final command result after every preceding terminal chunk has drained. */
  writeResultAsync(result: IDaemonCommandResult): Promise<void>;

  /** Writes the request's current one-based scheduler queue position. */
  writeQueuePositionAsync?(message: IDaemonRequestQueuePositionMessage): Promise<void>;
}
