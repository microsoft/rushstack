// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IDaemonClientCaps } from './DaemonClientCaps';
import type { DaemonProtocolErrorCode } from './DaemonProtocolError';
import type { IDaemonProtocolVersion } from './DaemonProtocolVersion';

/** The empty payload of control messages that carry no data. @beta */
export type DaemonEmptyPayload = Record<string, never>;

/** The first frame a client sends on a new connection. @beta */
export interface IDaemonHelloMessage {
  readonly kind: 'hello';
  readonly payload: { readonly protocolVersion: IDaemonProtocolVersion };
}

/** The server's accepting reply to a compatible `hello`. @beta */
export interface IDaemonHelloAckMessage {
  readonly kind: 'helloAck';
  readonly payload: {
    readonly protocolVersion: IDaemonProtocolVersion;
    readonly sessionId: string;
  };
}

/** Subscribes the connection with the given client capabilities. @beta */
export interface IDaemonSubscribeMessage {
  readonly kind: 'subscribe';
  readonly payload: IDaemonClientCaps;
}

/** Ends this connection's subscription. @beta */
export interface IDaemonUnsubscribeMessage {
  readonly kind: 'unsubscribe';
  readonly payload: DaemonEmptyPayload;
}

/** A liveness probe. @beta */
export interface IDaemonPingMessage {
  readonly kind: 'ping';
  readonly payload: DaemonEmptyPayload;
}

/** The liveness reply. @beta */
export interface IDaemonPongMessage {
  readonly kind: 'pong';
  readonly payload: { readonly uptimeMs: number };
}

/** A protocol error sent on the wire. @beta */
export interface IDaemonErrorMessage {
  readonly kind: 'error';
  readonly payload: {
    readonly code: DaemonProtocolErrorCode;
    readonly message: string;
  };
}

/**
 * The union of every control message carried by a `0x01` control-json frame.
 *
 * @remarks
 * Every variant has the uniform `{ kind, payload }` shape, so reads of `kind`
 * stay monomorphic and the payload type is discriminated by `kind`.
 * @beta
 */
export type DaemonControlMessage =
  | IDaemonHelloMessage
  | IDaemonHelloAckMessage
  | IDaemonSubscribeMessage
  | IDaemonUnsubscribeMessage
  | IDaemonPingMessage
  | IDaemonPongMessage
  | IDaemonErrorMessage;

/**
 * The runtime list of control message `kind` discriminants, from which
 * {@link DaemonControlMessageKind} is derived (single source of truth).
 *
 * @beta
 */
export const DAEMON_CONTROL_MESSAGE_KINDS: readonly [
  'hello',
  'helloAck',
  'subscribe',
  'unsubscribe',
  'ping',
  'pong',
  'error'
] = ['hello', 'helloAck', 'subscribe', 'unsubscribe', 'ping', 'pong', 'error'];

/** The union of control message `kind` discriminants, derived from the list. @beta */
export type DaemonControlMessageKind = (typeof DAEMON_CONTROL_MESSAGE_KINDS)[number];

const CONTROL_KIND_SET: ReadonlySet<string> = new Set<string>(DAEMON_CONTROL_MESSAGE_KINDS);

/** Returns `true` when `value` is a control message `kind`. @beta */
export function isDaemonControlMessageKind(value: unknown): value is DaemonControlMessageKind {
  return typeof value === 'string' && CONTROL_KIND_SET.has(value);
}
