// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as net from 'node:net';

import {
  type DaemonMessage,
  type IBaseMessage,
  type IDaemonStatusResponse,
  type IPongResponse,
  parseMessages,
  serializeMessage
} from './RushdProtocol';
import { getPipePath, isDaemonAlive, readPidFile } from './RushdLifecycle';

export interface IRushdClientOptions {
  workspaceRoot: string;
  timeoutMs?: number;
}

/**
 * Client for communicating with a running rushd daemon.
 */
export class RushdClient {
  private readonly _workspaceRoot: string;
  private readonly _timeoutMs: number;
  private readonly _pipePath: string;

  private _socket: net.Socket | undefined;
  private _buffer: string = '';
  private _messageHandler: ((message: DaemonMessage) => void) | undefined;

  public constructor(options: IRushdClientOptions) {
    this._workspaceRoot = options.workspaceRoot;
    this._timeoutMs = options.timeoutMs ?? 5000;
    this._pipePath = getPipePath(this._workspaceRoot);
  }

  /**
   * Check if a daemon is running and reachable for this workspace.
   */
  public async isDaemonRunningAsync(): Promise<boolean> {
    const pid: number | undefined = readPidFile(this._workspaceRoot);
    if (pid === undefined) {
      return false;
    }
    return isDaemonAlive(this._workspaceRoot);
  }

  /**
   * Connect to the running daemon.
   */
  public async connectAsync(): Promise<void> {
    if (this._socket) {
      throw new Error('Already connected');
    }

    await new Promise<void>((resolve, reject) => {
      const socket: net.Socket = net.connect(this._pipePath, () => {
        this._socket = socket;
        resolve();
      });

      socket.on('data', (data: Buffer) => {
        this._buffer += data.toString();
        const { messages, remainder } = parseMessages(this._buffer);
        this._buffer = remainder;

        for (const message of messages) {
          if (this._messageHandler) {
            this._messageHandler(message as DaemonMessage);
          }
        }
      });

      socket.on('error', (err: Error) => {
        if (!this._socket) {
          reject(new Error(`Failed to connect to rushd: ${err.message}`));
        }
      });

      socket.setTimeout(this._timeoutMs, () => {
        socket.destroy();
        reject(new Error('Connection to rushd timed out'));
      });
    });
  }

  /**
   * Disconnect from the daemon.
   */
  public disconnect(): void {
    if (this._socket) {
      this._socket.end();
      this._socket = undefined;
    }
    this._messageHandler = undefined;
    this._buffer = '';
  }

  /**
   * Send a message and wait for a single response.
   */
  public async sendAsync(message: IBaseMessage): Promise<DaemonMessage> {
    if (!this._socket) {
      throw new Error('Not connected to rushd');
    }

    return new Promise<DaemonMessage>((resolve, reject) => {
      const previousHandler: typeof this._messageHandler = this._messageHandler;

      this._messageHandler = (response: DaemonMessage) => {
        this._messageHandler = previousHandler;
        resolve(response);
      };

      this._socket!.write(serializeMessage(message), (err?: Error) => {
        if (err) {
          this._messageHandler = previousHandler;
          reject(new Error(`Failed to send message: ${err.message}`));
        }
      });
    });
  }

  /**
   * Send a message and stream responses until a terminal message (result or error) is received.
   */
  public async sendAndStreamAsync(
    message: IBaseMessage,
    onMessage: (message: DaemonMessage) => void
  ): Promise<DaemonMessage> {
    if (!this._socket) {
      throw new Error('Not connected to rushd');
    }

    return new Promise<DaemonMessage>((resolve, reject) => {
      const previousHandler: typeof this._messageHandler = this._messageHandler;

      this._messageHandler = (response: DaemonMessage) => {
        onMessage(response);

        // Terminal messages end the stream
        if (response.type === 'result' || response.type === 'error') {
          this._messageHandler = previousHandler;
          resolve(response);
        }
      };

      this._socket!.write(serializeMessage(message), (err?: Error) => {
        if (err) {
          this._messageHandler = previousHandler;
          reject(new Error(`Failed to send message: ${err.message}`));
        }
      });

      this._socket!.on('end', () => {
        this._messageHandler = previousHandler;
        reject(new Error('Daemon disconnected unexpectedly'));
      });
    });
  }

  /**
   * Convenience: ping the daemon.
   */
  public async pingAsync(): Promise<IPongResponse> {
    return (await this.sendAsync({ type: 'ping' })) as IPongResponse;
  }

  /**
   * Convenience: get daemon status.
   */
  public async getStatusAsync(): Promise<IDaemonStatusResponse> {
    return (await this.sendAsync({ type: 'status' })) as IDaemonStatusResponse;
  }

  /**
   * Convenience: request daemon shutdown.
   */
  public async shutdownAsync(): Promise<void> {
    await this.sendAsync({ type: 'shutdown' });
    this.disconnect();
  }
}
