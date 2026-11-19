// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as net from 'node:net';

import { DaemonFrameConnection } from './DaemonFrameConnection';
import { DaemonTransportError, DaemonTransportErrorCode } from './DaemonTransportError';

const DEFAULT_CONNECT_TIMEOUT_MS: number = 5000;
const NO_TIMEOUT: number = 0;

/** Options for {@link connectDaemonAsync}. @beta */
export interface IDaemonConnectorOptions {
  /** The connect timeout in milliseconds. Defaults to 5000. */
  readonly connectTimeoutMs?: number;
}

/**
 * Connects to the daemon's socket (POSIX) or named pipe (Windows).
 *
 * @throws {@link DaemonTransportError} `connectionRefused` when nothing listens
 * at the path, or `connectionTimeout` when the attempt stalls.
 *
 * @beta
 */
export async function connectDaemonAsync(
  socketPath: string,
  options?: IDaemonConnectorOptions
): Promise<DaemonFrameConnection> {
  const timeoutMs: number = options?.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
  return new Promise<DaemonFrameConnection>(
    (resolve: (connection: DaemonFrameConnection) => void, reject: (error: Error) => void) => {
      const socket: net.Socket = net.createConnection(socketPath);
      socket.setTimeout(timeoutMs);
      socket.once('connect', () => {
        socket.setTimeout(NO_TIMEOUT);
        resolve(new DaemonFrameConnection(socket));
      });
      socket.once('timeout', () => fail(socket, reject, DaemonTransportErrorCode.connectionTimeout,
        `Timed out connecting to daemon at ${socketPath}.`));
      socket.once('error', () => fail(socket, reject, DaemonTransportErrorCode.connectionRefused,
        `Could not connect to daemon at ${socketPath}.`));
    }
  );
}

function fail(
  socket: net.Socket,
  reject: (error: Error) => void,
  code: DaemonTransportErrorCode,
  message: string
): void {
  socket.destroy();
  reject(new DaemonTransportError(code, message));
}
