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
  private readonly _socket: net.Socket;
  private readonly _decoder: DaemonFrameDecoder = new DaemonFrameDecoder();
  private _frameHandler: ((frame: IDaemonFrame) => void) | undefined;
  private _closedHandler: ((error: Error | undefined) => void) | undefined;
  private _closedError: Error | undefined;

  public constructor(socket: net.Socket) {
    this._socket = socket;
    socket.on('data', (chunk: Buffer) => this._onData(chunk));
    socket.on('error', (error: Error) => this._onError(error));
    socket.on('close', () => this._onClose());
  }

  /** Registers the frame handler invoked for each decoded frame. */
  public onFrame(handler: (frame: IDaemonFrame) => void): void {
    this._frameHandler = handler;
  }
  /** Registers the close handler, invoked at most once with the cause. */
  public onClosed(handler: (error: Error | undefined) => void): void {
    this._closedHandler = handler;
  }

  /** Encodes and writes a frame, resolving when the socket has drained it. @throws {@link DaemonTransportError} when closed. */
  public async sendFrameAsync(frame: IDaemonFrame): Promise<void> {
    this._assertOpen();
    if (!this._socket.write(encodeDaemonFrame(frame))) {
      await once(this._socket, 'drain');
    }
  }

  /** Half-closes the writable side and releases the socket. */
  public async closeAsync(): Promise<void> {
    this._socket.end();
    this._socket.destroySoon();
  }

  /** The wrapped socket, for the internal raw-write test hook. @internal */
  public get socket(): net.Socket {
    return this._socket;
  }
  private _assertOpen(): void {
    if (this._closedError !== undefined || this._socket.closed) {
      throw new DaemonTransportError(
        DaemonTransportErrorCode.transportClosed,
        'Cannot send a frame on a closed connection.'
      );
    }
  }

  private _onData(chunk: Buffer): void {
    let frames: IDaemonFrame[];
    try {
      frames = this._decoder.push(chunk);
    } catch (error) {
      this._fail(error);
      return;
    }
    for (const frame of frames) {
      this._dispatchFrame(frame);
    }
  }
  private _dispatchFrame(frame: IDaemonFrame): void {
    try {
      this._frameHandler?.(frame);
    } catch (error) {
      this._fail(error);
    }
  }

  private _fail(error: unknown): void {
    const cause: Error = error instanceof Error ? error : new Error(String(error));
    this._closedError = this._closedError ?? cause;
    this._socket.destroy(cause);
  }
  private _onError(error: Error): void {
    this._closedError = this._closedError ?? error;
  }

  private _onClose(): void {
    this._closedHandler?.(this._closedError);
  }
}
