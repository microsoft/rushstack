// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

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

  /** Writes one request-scoped terminal chunk through the client's backpressured destination. */
  writeTerminalChunkAsync(stream: 'stdout' | 'stderr', chunk: Uint8Array): Promise<void>;
}
