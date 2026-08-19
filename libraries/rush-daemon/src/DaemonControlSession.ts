// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { randomUUID } from 'node:crypto';

import {
  DAEMON_PROTOCOL_VERSION,
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

export interface IDaemonControlSessionOptions {
  readonly daemonVersion: string;
  readonly startedAtMs: number;
  readonly onClosed: (session: DaemonControlSession, error: Error | undefined) => void;
  readonly onError: (error: Error) => void;
}

export class DaemonControlSession {
  readonly #connection: DaemonFrameConnection;
  readonly #options: IDaemonControlSessionOptions;
  #handshakeComplete: boolean = false;
  #sendQueue: Promise<void> = Promise.resolve();

  public constructor(connection: DaemonFrameConnection, options: IDaemonControlSessionOptions) {
    this.#connection = connection;
    this.#options = options;
    connection.onFrame((frame: IDaemonFrame) => this._onFrame(frame));
    connection.onClosed((error: Error | undefined) => options.onClosed(this, error));
  }

  public closeAsync(): Promise<void> {
    return this.#connection.closeAsync();
  }

  private _onFrame(frame: IDaemonFrame): void {
    if (frame.kind !== DaemonFrameType.controlJson) {
      throw new DaemonProtocolError(
        'malformedControlMessage',
        'A daemon control connection only accepts control frames.'
      );
    }
    const message: DaemonControlMessage = decodeDaemonControlMessage(frame.payload);
    if (!this.#handshakeComplete) {
      this._handleHello(message);
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
      this.#handshakeComplete = true;
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
        daemonVersion: this.#options.daemonVersion,
        protocolVersion: DAEMON_PROTOCOL_VERSION,
        uptimeMs: Date.now() - this.#options.startedAtMs
      }
    };
  }

  private _send(message: DaemonControlMessage, closeAfterSend: boolean = false): void {
    const frame: IDaemonFrame = {
      kind: DaemonFrameType.controlJson,
      payload: encodeDaemonControlMessage(message)
    };
    this.#sendQueue = this.#sendQueue
      .then(() => this.#connection.sendFrameAsync(frame))
      .then(() => (closeAfterSend ? this.#connection.closeAsync() : undefined))
      .catch((error: unknown) => this._handleSendErrorAsync(error));
  }

  private async _handleSendErrorAsync(error: unknown): Promise<void> {
    const normalizedError: Error = error instanceof Error ? error : new Error(String(error));
    this.#options.onError(normalizedError);
    await this.#connection.closeAsync();
  }
}
