// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/** The first additive protocol minor that supports request-scoped interactive I/O. @beta */
export const DAEMON_INTERACTIVE_IO_PROTOCOL_MINOR: number = 3;

/** The first additive protocol minor that supports request admission. @beta */
export const DAEMON_REQUEST_ADMISSION_PROTOCOL_MINOR: number = 4;

/** The first additive protocol minor that supports request lifecycle controls. @beta */
export const DAEMON_REQUEST_LIFECYCLE_PROTOCOL_MINOR: number = 5;

/** The first additive protocol minor that supports acknowledged daemon shutdown. @beta */
export const DAEMON_LIFECYCLE_PROTOCOL_MINOR: number = 6;

/** The first additive protocol minor supporting stdin admission and EOF. @beta */
export const DAEMON_INPUT_LIFECYCLE_PROTOCOL_MINOR: number = 7;

/** The first additive protocol minor supporting graph generation fencing. @beta */
export const DAEMON_GRAPH_GENERATION_PROTOCOL_MINOR: number = 9;

/** The first additive protocol minor supporting explicit Rush/Rushx invocation selection. @beta */
export const DAEMON_INVOCATION_KIND_PROTOCOL_MINOR: number = 8;

/** The first minor supporting native mutations and guaranteed pre-execution restart outcomes. @beta */
export const DAEMON_WORKSPACE_RESTART_PROTOCOL_MINOR: number = 10;

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
  minor: DAEMON_WORKSPACE_RESTART_PROTOCOL_MINOR
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
