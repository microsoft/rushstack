// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * The wire frame type byte of the rushd protocol.
 *
 * @remarks
 * The taxonomy is fixed by the protocol specification:
 * `0x01` control-json, `0x02` log-stdout, `0x03` log-stderr, `0x04` stdin, `0x05` event.
 *
 * @beta
 */
export enum DaemonFrameType {
  /** A UTF-8 JSON control message, for example `hello` or `subscribe`. */
  controlJson = 0x01,
  /** Raw stdout bytes belonging to one operation's stream. */
  logStdout = 0x02,
  /** Raw stderr bytes belonging to one operation's stream. */
  logStderr = 0x03,
  /** Raw stdin bytes forwarded from a client. */
  stdin = 0x04,
  /** A UTF-8 JSON event envelope. */
  event = 0x05
}

const ALL_FRAME_TYPES: readonly DaemonFrameType[] = [
  DaemonFrameType.controlJson,
  DaemonFrameType.logStdout,
  DaemonFrameType.logStderr,
  DaemonFrameType.stdin,
  DaemonFrameType.event
];

/**
 * Returns `true` when `value` is a byte assigned to a known frame type.
 *
 * @beta
 */
export function isDaemonFrameType(value: number): value is DaemonFrameType {
  return (ALL_FRAME_TYPES as readonly number[]).includes(value);
}
