// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IDaemonHelloAckMessage, IDaemonHelloMessage } from './DaemonControlMessage';
import { ProtocolVersionMismatchError } from './DaemonProtocolError';
import type { IDaemonProtocolVersion } from './DaemonProtocolVersion';
import { isDaemonProtocolCompatible } from './DaemonProtocolVersion';

/**
 * Creates the `hello` message a client sends as its first frame.
 *
 * @beta
 */
export function createDaemonHello(protocolVersion: IDaemonProtocolVersion): IDaemonHelloMessage {
  return { kind: 'hello', protocolVersion };
}

/**
 * Creates the `helloAck` message a server replies with when versions match.
 *
 * @param protocolVersion - the server's own protocol version
 * @param sessionId - the session identifier assigned to the connection
 *
 * @beta
 */
export function createDaemonHelloAck(
  protocolVersion: IDaemonProtocolVersion,
  sessionId: string
): IDaemonHelloAckMessage {
  return { kind: 'helloAck', protocolVersion, sessionId };
}

/**
 * The outcome of evaluating a peer's `hello` against the local protocol version.
 *
 * @beta
 */
export type DaemonHandshakeOutcome =
  | { readonly accepted: true; readonly ack: IDaemonHelloAckMessage }
  | { readonly accepted: false; readonly error: ProtocolVersionMismatchError };

/**
 * Evaluates a peer's `hello`; on major-version match returns the `helloAck` to
 * send, otherwise the typed mismatch error to send (or throw).
 *
 * @beta
 */
export function negotiateDaemonHello(
  hello: IDaemonHelloMessage,
  localVersion: IDaemonProtocolVersion,
  sessionId: string
): DaemonHandshakeOutcome {
  if (!isDaemonProtocolCompatible(localVersion, hello.protocolVersion)) {
    return {
      accepted: false,
      error: new ProtocolVersionMismatchError(localVersion.major, hello.protocolVersion.major)
    };
  }
  return { accepted: true, ack: createDaemonHelloAck(localVersion, sessionId) };
}
