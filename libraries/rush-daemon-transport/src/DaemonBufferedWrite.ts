// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as net from 'node:net';

import { DaemonTransportError, DaemonTransportErrorCode } from './DaemonTransportError';

/**
 * Waits until a socket whose `write()` returned `false` has written what it buffered.
 * @remarks
 * `'drain'` alone can wait forever. A socket that is ending, as the daemon's side is once its peer
 * half-closes, finishes writing without a `'drain'`, and a socket destroyed without an error emits no
 * `'error'`. So `'finish'` resolves too, `'error'` rejects with its error, and a `'close'` that comes
 * first rejects with `transportClosed`.
 * @internal
 */
export function waitForBufferedWriteAsync(socket: net.Socket): Promise<void> {
  return new Promise<void>((resolve: () => void, reject: (error: Error) => void) => {
    function settle(error: Error | undefined): void {
      socket.off('drain', onWritten).off('finish', onWritten).off('close', onClosed).off('error', settle);
      if (error === undefined) {
        resolve();
      } else {
        reject(error);
      }
    }
    function onWritten(): void {
      settle(undefined);
    }
    function onClosed(): void {
      settle(
        new DaemonTransportError(
          DaemonTransportErrorCode.transportClosed,
          'The connection closed before it wrote a frame.'
        )
      );
    }
    socket.on('drain', onWritten).on('finish', onWritten).on('close', onClosed).on('error', settle);
  });
}
