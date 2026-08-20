// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { once } from 'node:events';
import type * as net from 'node:net';

import { DaemonFrameDecoder, encodeDaemonFrame } from '@rushstack/rush-daemon-protocol';
import type { IDaemonFrame } from '@rushstack/rush-daemon-protocol';

import { DaemonTransportError, DaemonTransportErrorCode } from './DaemonTransportError';

/** One end of a framed rushd connection over a `net` socket (Unix socket or named pipe).
 * @remarks
 * Incoming bytes decode to frames in wire order; a malformed frame or a throwing handler fails the
 * connection closed instead of escaping the socket callback. Outgoing frames are backpressured so a
 * slow consumer loses nothing.
 * @beta */
export class DaemonFrameConnection {
  readonly #socket: net.Socket;
  readonly #decoder: DaemonFrameDecoder = new DaemonFrameDecoder();
  #frameHandler: ((frame: IDaemonFrame) => void) | undefined;
  #closedHandler: ((error: Error | undefined) => void) | undefined;
  #closedError: Error | undefined;

  public constructor(socket: net.Socket) {
    this.#socket = socket;
    socket.on('data', (chunk: Buffer) => this.#onData(chunk));
    socket.on('error', (error: Error) => this.#onError(error));
    socket.on('close', () => this.#onClose());
  }

  /** Registers the frame handler invoked for each decoded frame. */
  public onFrame(handler: (frame: IDaemonFrame) => void): void {
    this.#frameHandler = handler;
  }
  /** Registers the close handler, invoked at most once with the cause. */
  public onClosed(handler: (error: Error | undefined) => void): void {
    this.#closedHandler = handler;
  }

  /** Encodes and writes a frame, resolving when the socket has drained it. @throws {@link DaemonTransportError} when closed. */
  public async sendFrameAsync(frame: IDaemonFrame): Promise<void> {
    this.#assertOpen();
    if (!this.#socket.write(encodeDaemonFrame(frame))) {
      await once(this.#socket, 'drain');
    }
  }

  /** Half-closes the writable side and releases the socket. */
  public async closeAsync(): Promise<void> {
    this.#socket.end();
    this.#socket.destroySoon();
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

  #onData(chunk: Buffer): void {
    let frames: IDaemonFrame[];
    try {
      frames = this.#decoder.push(chunk);
    } catch (error) {
      this.#fail(error);
      return;
    }
    for (const frame of frames) {
      this.#dispatchFrame(frame);
    }
  }
  #dispatchFrame(frame: IDaemonFrame): void {
    try {
      this.#frameHandler?.(frame);
    } catch (error) {
      this.#fail(error);
    }
  }

  #fail(error: unknown): void {
    const cause: Error = error instanceof Error ? error : new Error(String(error));
    this.#closedError = this.#closedError ?? cause;
    this.#socket.destroy(cause);
  }
  #onError(error: Error): void {
    this.#closedError = this.#closedError ?? error;
  }

  #onClose(): void {
    this.#closedHandler?.(this.#closedError);
  }
}
