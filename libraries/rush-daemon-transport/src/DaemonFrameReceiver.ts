// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as net from 'node:net';

import { DaemonFrameDecoder } from '@rushstack/rush-daemon-protocol';
import type { IDaemonFrame } from '@rushstack/rush-daemon-protocol';

/**
 * The receiving side of a `DaemonFrameConnection`. It decodes the socket's bytes to frames in wire order and
 * hands them to the frame handler one at a time, and it tracks whether the socket closed after it read every
 * byte that the peer sent.
 * @remarks
 * The socket is paused while the handler runs, so bytes that arrive meanwhile wait in its buffer, and a close
 * that comes first discards them: a failed write, or a reset from the peer. The operating system reports a
 * reset only after the bytes that arrived before it, so a reset with nothing buffered lost nothing. A named
 * pipe ends rather than resets.
 * @internal
 */
export class DaemonFrameReceiver {
  public frameHandler: ((frame: IDaemonFrame) => void | Promise<void>) | undefined;
  readonly #socket: net.Socket;
  readonly #fail: (error: unknown) => void;
  readonly #decoder: DaemonFrameDecoder = new DaemonFrameDecoder();
  #receiveQueue: Promise<void> = Promise.resolve();
  #readAll: boolean = false;
  #discarded: boolean = false;
  public constructor(socket: net.Socket, fail: (error: unknown) => void) {
    this.#socket = socket;
    this.#fail = fail;
    socket.on('data', (chunk: Buffer) => this.#onData(chunk));
    socket.on('end', () => {
      this.#readAll = true;
    });
    socket.on('error', (error: Error) => {
      this.#readAll ||= isResetWithNothingUnread(error, socket);
    });
  }
  /** Whether the socket has closed after it read every byte that the peer sent, and this side did not discard. */
  public get closedAfterReadingAll(): boolean {
    return this.#socket.closed && this.#readAll && !this.#discarded;
  }
  /** Records that this side is closing the connection, which may discard bytes that arrived but were not read. */
  public discard(): void {
    this.#discarded = true;
  }
  #onData(chunk: Buffer): void {
    let frames: IDaemonFrame[];
    try {
      frames = this.#decoder.push(chunk);
    } catch (error) {
      this.#fail(error);
      return;
    }
    this.#socket.pause();
    this.#receiveQueue = this.#receiveQueue
      .then(() => this.#dispatchFramesAsync(frames))
      .then(() => {
        this.#socket.resume();
      })
      .catch((error: unknown) => this.#fail(error));
  }
  async #dispatchFramesAsync(frames: ReadonlyArray<IDaemonFrame>): Promise<void> {
    for (const frame of frames) {
      await this.frameHandler?.(frame);
    }
  }
}

/** A reset that a read reported while the socket's buffer held nothing that the peer sent. */
function isResetWithNothingUnread(error: Error, socket: net.Socket): boolean {
  const { code, syscall } = error as NodeJS.ErrnoException;
  return code === 'ECONNRESET' && syscall === 'read' && !socket.readableLength;
}
