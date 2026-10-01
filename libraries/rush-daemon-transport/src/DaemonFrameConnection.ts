// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as net from 'node:net';

import { encodeDaemonFrame } from '@rushstack/rush-daemon-protocol';
import type { IDaemonFrame } from '@rushstack/rush-daemon-protocol';

import { waitForBufferedWriteAsync, writeUntilWrittenAsync } from './DaemonBufferedWrite';
import { DaemonFrameReceiver } from './DaemonFrameReceiver';
import { DaemonTransportError, DaemonTransportErrorCode } from './DaemonTransportError';

/** One end of a framed rushd connection over a `net` socket (Unix socket or named pipe).
 * @remarks
 * Incoming bytes decode to frames in wire order; a malformed frame or a throwing handler fails the
 * connection closed instead of escaping the socket callback. Outgoing frames are backpressured so a
 * slow consumer loses nothing.
 * @beta */
export class DaemonFrameConnection {
  readonly #socket: net.Socket;
  readonly #receiver: DaemonFrameReceiver;
  #closedHandler: ((error: Error | undefined) => void) | undefined;
  #closedError: Error | undefined;
  public constructor(socket: net.Socket) {
    this.#socket = socket;
    this.#receiver = new DaemonFrameReceiver(socket, (error: unknown) => this.#fail(error));
    socket.on('error', (error: Error) => this.#onError(error));
    socket.on('close', () => this.#onClose());
  }
  /** Registers the serialized, backpressured handler invoked for each decoded frame. */
  public onFrame(handler: (frame: IDaemonFrame) => void | Promise<void>): void {
    this.#receiver.frameHandler = handler;
  }
  /** Registers the close handler, invoked at most once with the cause. */
  public onClosed(handler: (error: Error | undefined) => void): void {
    this.#closedHandler = handler;
  }
  /**
   * Whether the connection has closed after it read every byte that the peer sent, so that the close discarded
   * no frame: it read the peer's end, or a reset that came once nothing was left to read. Each of those frames
   * goes to the frame handler in order, though some may not be handled yet.
   * @remarks False while the connection is open, and after `abort()`, a malformed frame, a throwing handler or
   * any other close, such as a failed write, or a reset while bytes waited in the socket's buffer, which is
   * paused while a handler runs. The operating system reports a reset only after the bytes that came before it.
   */
  public get closedAfterReadingAll(): boolean {
    return this.#receiver.closedAfterReadingAll;
  }
  /** Encodes and writes a frame, resolving once the socket has written it. @throws {@link DaemonTransportError} when closed, or when it closes first. */
  public async sendFrameAsync(frame: IDaemonFrame): Promise<void> {
    this.#assertOpen();
    if (!this.#socket.write(encodeDaemonFrame(frame))) {
      await waitForBufferedWriteAsync(this.#socket);
    }
  }
  /**
   * Encodes and writes a frame, resolving only once the operating system holds all of it, after every earlier
   * frame, so that the peer can read it even if this process exits next. `sendFrameAsync` can resolve sooner.
   * @throws {@link DaemonTransportError} when closed, or the socket's error when the write fails.
   */
  public async sendFrameWrittenAsync(frame: IDaemonFrame): Promise<void> {
    this.#assertOpen();
    await writeUntilWrittenAsync(this.#socket, encodeDaemonFrame(frame));
  }
  /** Half-closes the writable side and releases the socket. */
  public async closeAsync(): Promise<void> {
    this.#socket.end();
    this.#socket.destroySoon();
  }
  /** Immediately closes a connection whose graceful drain cannot make progress. @internal */
  public abort(error: Error): void {
    this.#closedError = this.#closedError ?? error;
    this.#receiver.discard();
    this.#socket.destroy(error);
  }
  /** The wrapped socket, for the internal raw-write test hook. @internal */
  public get socket(): net.Socket {
    return this.#socket;
  }
  #assertOpen(): void {
    if (this.#closedError !== undefined || this.#socket.closed) {
      throw new DaemonTransportError(
        DaemonTransportErrorCode.transportClosed,
        'Cannot send a frame on a closed connection.'
      );
    }
  }
  #fail(error: unknown): void {
    const cause: Error = error instanceof Error ? error : new Error(String(error));
    this.#closedError = this.#closedError ?? cause;
    this.#receiver.discard();
    this.#socket.destroy(cause);
  }
  #onError(error: Error): void {
    this.#closedError = this.#closedError ?? error;
  }
  #onClose(): void {
    this.#closedHandler?.(this.#closedError);
  }
}
