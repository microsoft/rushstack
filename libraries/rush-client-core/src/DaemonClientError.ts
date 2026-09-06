// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/** A failure before readiness, or a connection lost without an authoritative result. @beta */
export type DaemonClientErrorCode = 'timeout' | 'versionMismatch' | 'disconnected' | 'startupFailed';

/** An actionable client failure. Never replay a request following a disconnect. @beta */
export class DaemonClientError extends Error {
  public readonly code: DaemonClientErrorCode;

  public constructor(code: DaemonClientErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.code = code;
    this.name = 'DaemonClientError';
  }
}
