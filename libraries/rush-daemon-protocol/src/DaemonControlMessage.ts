// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { DaemonProtocolErrorCode } from './DaemonProtocolError';
import type { IDaemonProtocolVersion } from './DaemonProtocolVersion';
import type { DaemonVerbosity } from './DaemonVerbosity';

/**
 * Terminal capabilities and verbosity requested by one client subscription.
 *
 * @remarks
 * Carried in the request envelope; the daemon applies `verbosity` as a
 * per-subscription serialization filter and threads `columns`/`colorLevel`
 * into child process environments (`FORCE_COLOR`/`COLUMNS`) for TTY clients.
 *
 * @beta
 */
export interface IDaemonClientCaps {
  /** The verbosity subset this client receives. Defaults to `normal`. */
  readonly verbosity?: DaemonVerbosity;
  /** Whether the client's output is an interactive TTY. */
  readonly isTTY: boolean;
  /** The client's terminal width in columns, when known. */
  readonly columns?: number;
  /** The client's color support level (0-3), when known. */
  readonly colorLevel?: number;
}

/** The first frame a client sends on a new connection. @beta */
export interface IDaemonHelloMessage {
  readonly kind: 'hello';
  readonly protocolVersion: IDaemonProtocolVersion;
}

/** The server's accepting reply to a compatible `hello`. @beta */
export interface IDaemonHelloAckMessage {
  readonly kind: 'helloAck';
  readonly protocolVersion: IDaemonProtocolVersion;
  readonly sessionId: string;
}

/** Subscribes the connection to event and log streams with the given capabilities. @beta */
export interface IDaemonSubscribeMessage {
  readonly kind: 'subscribe';
  readonly caps: IDaemonClientCaps;
}

/** A protocol error sent on the wire. @beta */
export interface IDaemonErrorMessage {
  readonly kind: 'error';
  readonly code: DaemonProtocolErrorCode;
  readonly message: string;
}

/**
 * The union of every control message carried by a `0x01` control-json frame.
 *
 * @beta
 */
export type DaemonControlMessage =
  | IDaemonHelloMessage
  | IDaemonHelloAckMessage
  | IDaemonSubscribeMessage
  | IDaemonErrorMessage
  | { readonly kind: 'unsubscribe' }
  | { readonly kind: 'ping' }
  | { readonly kind: 'pong'; readonly uptimeMs: number };

/**
 * The runtime list of control message `kind` discriminants.
 *
 * @beta
 */
export const DAEMON_CONTROL_MESSAGE_KINDS: readonly string[] = [
  'hello',
  'helloAck',
  'subscribe',
  'unsubscribe',
  'ping',
  'pong',
  'error'
];
