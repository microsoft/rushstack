// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * The closed set of machine-readable rushd transport error codes.
 *
 * @beta
 */
export enum DaemonTransportErrorCode {
  /** Another live daemon already owns the socket/pipe for this workspace key. */
  daemonAlreadyRunning = 'daemonAlreadyRunning',
  /** No daemon is listening at the socket/pipe path. */
  connectionRefused = 'connectionRefused',
  /** The connection attempt exceeded the configured timeout. */
  connectionTimeout = 'connectionTimeout',
  /** The transport was closed while an operation was in flight. */
  transportClosed = 'transportClosed'
}

/**
 * A typed error raised by the rushd socket/pipe transport.
 *
 * @beta
 */
export class DaemonTransportError extends Error {
  /**
   * The machine-readable error code.
   */
  public readonly code: DaemonTransportErrorCode;

  public constructor(code: DaemonTransportErrorCode, message: string) {
    super(message);
    this.name = 'DaemonTransportError';
    this.code = code;
  }
}
