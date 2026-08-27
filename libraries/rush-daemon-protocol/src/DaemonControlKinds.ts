// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/** Every control message `kind` discriminant. @beta */
export const DAEMON_CONTROL_MESSAGE_KINDS: readonly [
  'hello',
  'helloAck',
  'subscribe',
  'unsubscribe',
  'ping',
  'pong',
  'error',
  'setRawMode',
  'rawModeChanged',
  'terminalPolicy',
  'queuePosition'
] = [
  'hello', 'helloAck', 'subscribe', 'unsubscribe', 'ping', 'pong', 'error',
  'setRawMode', 'rawModeChanged', 'terminalPolicy', 'queuePosition'
];

/** The union of control message `kind` discriminants. @beta */
export type DaemonControlMessageKind = (typeof DAEMON_CONTROL_MESSAGE_KINDS)[number];

const CONTROL_KIND_SET: ReadonlySet<string> = new Set<string>(DAEMON_CONTROL_MESSAGE_KINDS);

/** Returns `true` when `value` is a control message `kind`. @beta */
export function isDaemonControlMessageKind(value: unknown): value is DaemonControlMessageKind {
  return typeof value === 'string' && CONTROL_KIND_SET.has(value);
}
