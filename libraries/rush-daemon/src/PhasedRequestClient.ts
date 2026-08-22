// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IDaemonEventEnvelope } from '@rushstack/rush-daemon-protocol';

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
  /** The connection session identifier used in structured event envelopes. */
  readonly sessionId: string;

  /** Writes one structured event through the client's backpressured destination. */
  writeEventAsync(event: IDaemonEventEnvelope): Promise<void>;

  /** Writes one operation-scoped output chunk through the client's backpressured destination. */
  writeLogChunkAsync(
    operationId: string,
    stream: 'stdout' | 'stderr',
    chunk: Uint8Array
  ): Promise<void>;
}
