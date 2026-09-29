// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * The members of a writable stream that {@link waitForStreamsToFlushAsync} uses.
 */
export interface IFlushableStream {
  readonly writable: boolean;
  readonly writableLength: number;
  write(chunk: string, callback: () => void): boolean;
  once(event: 'error', listener: () => void): unknown;
  removeListener(event: 'error', listener: () => void): unknown;
}

/**
 * Resolves once each stream has handed the output already written to it to the operating system,
 * or has failed.
 *
 * @remarks
 * On POSIX, Node.js writes to a pipe asynchronously, and `process.exit()` discards the output that
 * is still queued. Call this before `process.exit()`, or a reader that reads more slowly than the
 * process writes loses the end of the output, for example the summary of a failed build.
 *
 * A stream can fail while this waits, for example with EPIPE when its reader closes the pipe. This
 * handles the stream's `error` event, which would otherwise end the process as an uncaught exception
 * instead of letting the caller exit with its own exit code.
 */
export async function waitForStreamsToFlushAsync(streams: Iterable<IFlushableStream>): Promise<void> {
  const pendingWrites: Promise<void>[] = [];
  for (const stream of streams) {
    if (stream.writable && stream.writableLength > 0) {
      pendingWrites.push(
        new Promise<void>((resolve: () => void) => {
          const onError = (): void => resolve();
          stream.once('error', onError);
          // A stream finishes its writes in order, so the callback of this empty write runs after the
          // output queued before it has been written. If the stream fails, the callback runs before the
          // stream emits `error`, so a stream that can no longer be written keeps the listener.
          stream.write('', () => {
            if (stream.writable) {
              stream.removeListener('error', onError);
            }
            resolve();
          });
        })
      );
    }
  }

  await Promise.all(pendingWrites);
}
