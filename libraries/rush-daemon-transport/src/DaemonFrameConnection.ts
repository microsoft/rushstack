// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { once } from 'node:events';
import type * as net from 'node:net';

import { DaemonFrameDecoder, encodeDaemonFrame } from '@rushstack/rush-daemon-protocol';
import type { IDaemonFrame } from '@rushstack/rush-daemon-protocol';

import { DaemonTransportError, DaemonTransportErrorCode } from './DaemonTransportError';

/**
 * One end of a framed rushd connection over a `net` socket (Unix domain socket
 * or Windows named pipe).
 *
 * @remarks
 * Incoming bytes are decoded into frames in wire order. Outgoing frames are
 * written with backpressure: {@link DaemonFrameConnection.sendFrameAsync} only
 * resolves once the socket has accepted the bytes (awaiting `drain` when the
 * kernel buffer is full), so a slow consumer cannot lose frames.
 *
 * @beta
 */
export class DaemonFrameConnection {
  private readonly _socket: net.Socket;
  private readonly _decoder: DaemonFrameDecoder;
  private _frameHandler: ((frame: IDaemonFrame) => void) | undefined;
  private _closedHandler: ((error: Error | undefined) => void) | undefined;
  private _closedError: Error | undefined;

  public constructor(socket: net.Socket) {
    this._socket = socket;
    this._decoder = new DaemonFrameDecoder();
    socket.on('data', (chunk: Buffer) => this._onData(chunk));
    socket.on('error', (error: Error) => this._onError(error));
    socket.on('close', () => this._onClose());
  }

  /** Registers the single frame handler invoked for each decoded frame. */
  public onFrame(handler: (frame: IDaemonFrame) => void): void {
    this._frameHandler = handler;
  }

  /** Registers the close handler, invoked at most once with the cause, if any. */
  public onClosed(handler: (error: Error | undefined) => void): void {
    this._closedHandler = handler;
  }

  /**
   * Encodes and writes a frame, resolving when the socket has drained it.
   *
   * @throws {@link DaemonTransportError} with code `transportClosed` when the
   * socket closes (or errors) before the bytes are accepted.
   */
  public async sendFrameAsync(frame: IDaemonFrame): Promise<void> {
    this._assertOpen();
    const canContinue: boolean = this._socket.write(encodeDaemonFrame(frame));
    if (!canContinue) {
      await once(this._socket, 'drain');
    }
  }

  private _assertOpen(): void {
    if (this._closedError !== undefined || this._socket.closed) {
      throw new DaemonTransportError(
        DaemonTransportErrorCode.transportClosed,
        'Cannot send a frame on a closed connection.'
      );
    }
  }

  /** Half-closes the writable side and releases the socket. */
  public async closeAsync(): Promise<void> {
    this._socket.end();
    this._socket.destroySoon();
  }

  private _onData(chunk: Buffer): void {
    for (const frame of this._decoder.push(chunk)) {
      this._frameHandler?.(frame);
    }
  }

  private _onError(error: Error): void {
    this._closedError = this._closedError ?? error;
  }

  private _onClose(): void {
    this._closedHandler?.(this._closedError);
  }
}
