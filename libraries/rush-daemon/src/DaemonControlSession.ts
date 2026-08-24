// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { randomUUID } from 'node:crypto';

import {
  DAEMON_PROTOCOL_VERSION,
  DAEMON_INTERACTIVE_IO_PROTOCOL_MINOR,
  DaemonFrameType,
  DaemonProtocolError,
  decodeDaemonControlMessage,
  encodeDaemonControlMessage,
  negotiateDaemonHello
} from '@rushstack/rush-daemon-protocol';
import type {
  DaemonControlMessage,
  IDaemonErrorMessage,
  IDaemonFrame,
  IDaemonPongMessage
} from '@rushstack/rush-daemon-protocol';
import type { DaemonFrameConnection } from '@rushstack/rush-daemon-transport';

import {
  DaemonInteractiveConnection
} from './DaemonInteractiveConnection';
import type { IDaemonInteractiveConnection } from './DaemonInteractiveConnection';
import { isInteractiveRequestInputFailure } from './InteractiveRequestInputRouter';

export interface IDaemonControlSessionOptions {
  readonly daemonVersion: string;
  readonly startedAtMs: number;
  readonly onInteractiveConnection?: (connection: IDaemonInteractiveConnection) => void;
  readonly onClosed: (session: DaemonControlSession, error: Error | undefined) => void;
  readonly onError: (error: Error) => void;
}

export class DaemonControlSession {
  private readonly _connection: DaemonFrameConnection;
  private readonly _interactiveConnection: DaemonInteractiveConnection;
  private readonly _options: IDaemonControlSessionOptions;
  private _handshakeComplete: boolean = false;
  private _peerSupportsInteractiveProtocol: boolean = false;
  private _sendQueue: Promise<void> = Promise.resolve();

  public constructor(connection: DaemonFrameConnection, options: IDaemonControlSessionOptions) {
    this._connection = connection;
    this._options = options;
    this._interactiveConnection = new DaemonInteractiveConnection(
      (message: DaemonControlMessage) => this._enqueueSendAsync(message)
    );
    connection.onFrame((frame: IDaemonFrame) => this._onFrameAsync(frame));
    connection.onClosed((error: Error | undefined) => {
      this._interactiveConnection.close(error);
      options.onClosed(this, error);
    });
    options.onInteractiveConnection?.(this._interactiveConnection);
  }

  public closeAsync(): Promise<void> {
    return this._connection.closeAsync();
  }

  private async _onFrameAsync(frame: IDaemonFrame): Promise<void> {
    if (frame.kind === DaemonFrameType.stdin) {
      if (!this._handshakeComplete) {
        throw new DaemonProtocolError(
          'malformedControlMessage',
          'The first frame on a connection must be a hello control message.'
        );
      }
      try {
        await this._interactiveConnection.routeStdinFrameAsync(frame.payload);
      } catch (error) {
        if (!isInteractiveRequestInputFailure(error)) {
          throw error;
        }
      }
      return;
    }
    if (frame.kind !== DaemonFrameType.controlJson) {
      throw new DaemonProtocolError(
        'malformedControlMessage',
        'A daemon control connection only accepts control frames.'
      );
    }
    const message: DaemonControlMessage = decodeDaemonControlMessage(frame.payload);
    if (!this._handshakeComplete) {
      this._handleHello(message);
    } else if (this._interactiveConnection.handleControlMessage(message)) {
      return;
    } else if (message.kind === 'subscribe') {
      this._interactiveConnection.setEnabled(
        this._peerSupportsInteractiveProtocol && message.payload.supportsInteractiveIO === true
      );
    } else if (message.kind === 'ping') {
      this._send(this._createPong());
    } else {
      throw new DaemonProtocolError(
        'malformedControlMessage',
        `Control message "${message.kind}" is not valid in this daemon host state.`
      );
    }
  }

  private _handleHello(message: DaemonControlMessage): void {
    if (message.kind !== 'hello') {
      throw new DaemonProtocolError(
        'malformedControlMessage',
        'The first control message on a connection must be hello.'
      );
    }
    const outcome: ReturnType<typeof negotiateDaemonHello> = negotiateDaemonHello(
      message,
      DAEMON_PROTOCOL_VERSION,
      randomUUID()
    );
    if (outcome.accepted) {
      this._handshakeComplete = true;
      this._peerSupportsInteractiveProtocol =
        message.payload.protocolVersion.minor >= DAEMON_INTERACTIVE_IO_PROTOCOL_MINOR;
      this._send(outcome.ack);
    } else {
      const errorMessage: IDaemonErrorMessage = {
        kind: 'error',
        payload: { code: outcome.error.code, message: outcome.error.message }
      };
      this._send(errorMessage, true);
    }
  }

  private _createPong(): IDaemonPongMessage {
    return {
      kind: 'pong',
      payload: {
        daemonVersion: this._options.daemonVersion,
        protocolVersion: DAEMON_PROTOCOL_VERSION,
        uptimeMs: Date.now() - this._options.startedAtMs
      }
    };
  }

  private _send(message: DaemonControlMessage, closeAfterSend: boolean = false): void {
    void this._enqueueSendAsync(message, closeAfterSend).catch((error: unknown) =>
      this._handleSendErrorAsync(error)
    );
  }

  private _enqueueSendAsync(
    message: DaemonControlMessage,
    closeAfterSend: boolean = false
  ): Promise<void> {
    const frame: IDaemonFrame = {
      kind: DaemonFrameType.controlJson,
      payload: encodeDaemonControlMessage(message)
    };
    const sendPromise: Promise<void> = this._sendQueue
      .then(() => this._connection.sendFrameAsync(frame))
      .then(() => (closeAfterSend ? this._connection.closeAsync() : undefined));
    this._sendQueue = sendPromise.catch(() => undefined);
    return sendPromise;
  }

  private async _handleSendErrorAsync(error: unknown): Promise<void> {
    const normalizedError: Error = error instanceof Error ? error : new Error(String(error));
    this._options.onError(normalizedError);
    await this._connection.closeAsync();
  }
}
