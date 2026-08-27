// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/** The first additive protocol minor that supports request-scoped interactive I/O. @beta */
export const DAEMON_INTERACTIVE_IO_PROTOCOL_MINOR: number = 3;

/**
 * A rushd wire protocol version.
 *
 * @remarks
 * The `major` version gates compatibility: peers whose major versions differ
 * reject one another during the handshake. `minor` versions are additive, so a
 * peer ignores unknown optional fields introduced by a newer minor.
 *
 * @beta
 */
export interface IDaemonProtocolVersion {
  /**
   * The major protocol version. Incremented only for breaking changes.
   */
  readonly major: number;

  /**
   * The minor protocol version. Incremented for additive, backward-compatible changes.
   */
  readonly minor: number;
}

/**
 * The wire protocol version implemented by this package.
 *
 * @remarks
 * Exchanged during the connection handshake; a major-version mismatch is a
 * typed, terminal error. Starts at `0.x` while rushd is in public beta.
 *
 * @beta
 */
export const DAEMON_PROTOCOL_VERSION: IDaemonProtocolVersion = {
  major: 0,
  minor: DAEMON_INTERACTIVE_IO_PROTOCOL_MINOR
};

/**
 * Returns `true` when two versions are wire-compatible (same major version).
 *
 * @beta
 */
export function isDaemonProtocolCompatible(
  local: IDaemonProtocolVersion,
  remote: IDaemonProtocolVersion
): boolean {
  return local.major === remote.major;
}
