// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * The wire frame kind byte of the rushd protocol.
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

const LOWEST_FRAME_TYPE: DaemonFrameType = DaemonFrameType.controlJson;
const HIGHEST_FRAME_TYPE: DaemonFrameType = DaemonFrameType.event;

/**
 * Returns `true` when `value` is a byte assigned to a known frame kind.
 *
 * @remarks
 * The taxonomy is a contiguous range, so the containment test is a numeric
 * comparison rather than a collection scan.
 *
 * @beta
 */
export function isDaemonFrameType(value: number): value is DaemonFrameType {
  return (
    Number.isInteger(value) && value >= LOWEST_FRAME_TYPE && value <= HIGHEST_FRAME_TYPE
  );
}
