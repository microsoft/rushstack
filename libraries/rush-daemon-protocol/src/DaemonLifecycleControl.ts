// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/** Requests shutdown of the connected workspace endpoint after hello. @beta */
export interface IDaemonShutdownMessage {
  readonly kind: 'shutdown';
  readonly payload: Record<string, never>;
}

/** Acknowledges shutdown before the host closes connections and releases its endpoint. @beta */
export interface IDaemonShutdownAckMessage {
  readonly kind: 'shutdownAck';
  readonly payload: {
    /**
     * Requests that were still running and will be aborted by this shutdown. Daemons older than
     * `DAEMON_SHUTDOWN_ACTIVE_REQUESTS_PROTOCOL_MINOR` omit it.
     */
    readonly activeRequests?: number;
  };
}
