// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as net from 'node:net';
import * as process from 'node:process';

import {
  type ClientMessage,
  type IBaseMessage,
  type IDaemonStatusResponse,
  type IErrorMessage,
  type IPongResponse,
  type IResultMessage,
  RUSHD_PROTOCOL_VERSION,
  parseMessages,
  serializeMessage
} from './RushdProtocol';
import {
  DEFAULT_IDLE_TIMEOUT_MS,
  getPipePath,
  isDaemonAlive,
  removePidFile,
  removeStaleSocket,
  writePidFile
} from './RushdLifecycle';

export interface IRushdDaemonOptions {
  workspaceRoot: string;
  idleTimeoutMs?: number;
}

interface IClientSession {
  id: number;
  socket: net.Socket;
  buffer: string;
}

type DaemonState = 'idle' | 'executing' | 'shutting-down';

export class RushdDaemon {
  private readonly _workspaceRoot: string;
  private readonly _idleTimeoutMs: number;
  private readonly _pipePath: string;
  private readonly _clients: Map<number, IClientSession> = new Map();
  private readonly _startTime: number = Date.now();

  private _server: net.Server | undefined;
  private _state: DaemonState = 'idle';
  private _nextClientId: number = 1;
  private _idleTimer: ReturnType<typeof setTimeout> | undefined;

  public constructor(options: IRushdDaemonOptions) {
    this._workspaceRoot = options.workspaceRoot;
    this._idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
    this._pipePath = getPipePath(this._workspaceRoot);
  }

  public get state(): DaemonState {
    return this._state;
  }

  public get activeClients(): number {
    return this._clients.size;
  }

  public get uptime(): number {
    return Date.now() - this._startTime;
  }

  /**
   * Start the daemon server. Resolves once the server is listening.
   */
  public async startAsync(): Promise<void> {
    // Check if another daemon is already running
    const alive: boolean = await isDaemonAlive(this._workspaceRoot);
    if (alive) {
      throw new Error('rushd is already running for this workspace');
    }

    // Clean up stale socket file on macOS/Linux
    removeStaleSocket(this._workspaceRoot);

    // Create the server
    this._server = net.createServer((socket: net.Socket) => {
      this._handleConnection(socket);
    });

    // Handle server errors
    this._server.on('error', (err: Error) => {
      console.error(`rushd server error: ${err.message}`);
    });

    // Start listening
    await new Promise<void>((resolve, reject) => {
      this._server!.listen(this._pipePath, () => {
        resolve();
      });
      this._server!.on('error', reject);
    });

    // Write PID file
    writePidFile(this._workspaceRoot);

    // Start idle timer
    this._resetIdleTimer();

    // Handle process signals for graceful shutdown
    process.on('SIGTERM', () => {
      this.shutdownAsync().catch(() => process.exit(1));
    });
    process.on('SIGINT', () => {
      this.shutdownAsync().catch(() => process.exit(1));
    });

    console.log(`rushd started (PID ${process.pid}), listening on ${this._pipePath}`);
  }

  /**
   * Gracefully shut down the daemon.
   */
  public async shutdownAsync(): Promise<void> {
    if (this._state === 'shutting-down') {
      return;
    }
    this._state = 'shutting-down';

    console.log('rushd shutting down...');

    // Clear idle timer
    if (this._idleTimer) {
      clearTimeout(this._idleTimer);
      this._idleTimer = undefined;
    }

    // Notify all clients
    for (const session of this._clients.values()) {
      this._sendMessage(session, {
        type: 'error',
        code: 'DAEMON_SHUTTING_DOWN',
        message: 'rushd is shutting down'
      } satisfies IErrorMessage);
      session.socket.end();
    }
    this._clients.clear();

    // Close server
    if (this._server) {
      await new Promise<void>((resolve) => {
        this._server!.close(() => resolve());
      });
      this._server = undefined;
    }

    // Clean up
    removePidFile(this._workspaceRoot);
    removeStaleSocket(this._workspaceRoot);

    console.log('rushd stopped');
  }

  /**
   * Send a message to a specific client.
   */
  private _sendMessage(session: IClientSession, message: IBaseMessage): void {
    if (!session.socket.destroyed) {
      session.socket.write(serializeMessage(message));
    }
  }

  /**
   * Broadcast a message to all connected clients.
   */
  private _broadcast(message: IBaseMessage): void {
    for (const session of this._clients.values()) {
      this._sendMessage(session, message);
    }
  }

  private _handleConnection(socket: net.Socket): void {
    const clientId: number = this._nextClientId++;
    const session: IClientSession = {
      id: clientId,
      socket,
      buffer: ''
    };
    this._clients.set(clientId, session);
    this._resetIdleTimer();

    socket.on('data', (data: Buffer) => {
      session.buffer += data.toString();
      const { messages, remainder } = parseMessages(session.buffer);
      session.buffer = remainder;

      for (const message of messages) {
        this._handleMessage(session, message as ClientMessage);
      }
    });

    socket.on('end', () => {
      this._clients.delete(clientId);
      this._resetIdleTimer();
    });

    socket.on('error', (err: Error) => {
      console.error(`Client ${clientId} error: ${err.message}`);
      this._clients.delete(clientId);
      this._resetIdleTimer();
    });
  }

  private _handleMessage(session: IClientSession, message: ClientMessage): void {
    switch (message.type) {
      case 'ping':
        this._handlePing(session, message);
        break;
      case 'status':
        this._handleStatus(session, message);
        break;
      case 'shutdown':
        this._handleShutdown(session);
        break;
      case 'build':
        this._handleBuild(session, message);
        break;
      case 'cancel':
        this._handleCancel(session, message);
        break;
      default:
        this._sendMessage(session, {
          type: 'error',
          requestId: message.requestId,
          code: 'UNKNOWN_MESSAGE',
          message: `Unknown message type: ${message.type}`
        } satisfies IErrorMessage);
    }
  }

  private _handlePing(session: IClientSession, message: IBaseMessage): void {
    this._sendMessage(session, {
      type: 'pong',
      requestId: message.requestId,
      protocolVersion: RUSHD_PROTOCOL_VERSION,
      uptime: this.uptime,
      activeClients: this.activeClients
    } satisfies IPongResponse);
  }

  private _handleStatus(session: IClientSession, message: IBaseMessage): void {
    this._sendMessage(session, {
      type: 'daemonStatus',
      requestId: message.requestId,
      state: this._state,
      uptime: this.uptime,
      activeClients: this.activeClients,
      protocolVersion: RUSHD_PROTOCOL_VERSION
    } satisfies IDaemonStatusResponse);
  }

  private _handleShutdown(session: IClientSession): void {
    this._sendMessage(session, {
      type: 'result',
      requestId: undefined,
      status: 'success',
      duration: 0,
      operations: { total: 0, succeeded: 0, failed: 0, skipped: 0 }
    } satisfies IResultMessage);

    // Shut down after sending the response
    this.shutdownAsync().then(() => {
      process.exit(0);
    });
  }

  private _handleBuild(session: IClientSession, message: ClientMessage): void {
    // TODO: Wire up to OperationGraph from PR #5378
    // For now, acknowledge the request
    this._state = 'executing';
    this._sendMessage(session, {
      type: 'result',
      requestId: message.requestId,
      status: 'success',
      duration: 0,
      operations: { total: 0, succeeded: 0, failed: 0, skipped: 0 }
    } satisfies IResultMessage);
    this._state = 'idle';
    this._resetIdleTimer();
  }

  private _handleCancel(session: IClientSession, message: IBaseMessage): void {
    // TODO: Wire up to OperationGraph.abortCurrentIterationAsync()
    this._sendMessage(session, {
      type: 'result',
      requestId: message.requestId,
      status: 'cancelled',
      duration: 0,
      operations: { total: 0, succeeded: 0, failed: 0, skipped: 0 }
    } satisfies IResultMessage);
  }

  private _resetIdleTimer(): void {
    if (this._idleTimer) {
      clearTimeout(this._idleTimer);
    }

    // Only auto-shutdown if no clients are connected and we're idle
    if (this._clients.size === 0 && this._state === 'idle') {
      this._idleTimer = setTimeout(() => {
        console.log('rushd auto-shutting down due to idle timeout');
        this.shutdownAsync().then(() => {
          process.exit(0);
        });
      }, this._idleTimeoutMs);
    }
  }
}
