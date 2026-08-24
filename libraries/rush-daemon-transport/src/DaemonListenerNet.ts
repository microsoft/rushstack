// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as net from 'node:net';

import { DaemonTransportError, DaemonTransportErrorCode } from './DaemonTransportError';

/** A `net` error with its Node.js `code` string. @internal */
export interface INetError extends Error {
  code?: string;
}

/** The Node.js error code for a bound socket/pipe path. */
export const ADDRESS_IN_USE: string = 'EADDRINUSE';

/**
 * Attempts one `listen` on `socketPath`, resolving with the error (if any)
 * instead of rejecting so callers can implement retry/reclaim loops.
 *
 * @internal
 */
export async function listenOrErrorAsync(
  server: net.Server,
  socketPath: string
): Promise<INetError | undefined> {
  return new Promise((resolve: (error: INetError | undefined) => void) => {
    const onError: (error: INetError) => void = (error: INetError) => resolve(error);
    server.once('error', onError);
    server.listen(socketPath, () => {
      server.removeListener('error', onError);
      resolve(undefined);
    });
  });
}

/**
 * Maps a `net` listen failure to a typed transport error.
 *
 * @internal
 */
export function toListenTransportError(error: INetError, socketPath: string): DaemonTransportError {
  if (error.code === ADDRESS_IN_USE) {
    return new DaemonTransportError(
      DaemonTransportErrorCode.daemonAlreadyRunning,
      `The daemon path ${socketPath} is still in use after reclaim.`
    );
  }
  return new DaemonTransportError(
    DaemonTransportErrorCode.transportClosed,
    `Failed to listen at ${socketPath}: ${error.message}`
  );
}
