// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  DaemonFrameType,
  encodeDaemonEventFrame,
  encodeDaemonLogChunk
} from '@rushstack/rush-daemon-protocol';
import type {
  DaemonControlMessage,
  DaemonRequestRejectionCode,
  IDaemonCommandResult,
  IDaemonEventEnvelope,
  IDaemonFrame,
  IDaemonPhasedRequestResult,
  IDaemonRequestQueuePositionMessage,
  IDaemonTerminalPolicyResult
} from '@rushstack/rush-daemon-protocol';

import type { IDaemonRequestDispatchClient } from './DaemonRequestDispatcher';
import type { IInteractiveRequestSession } from './InteractiveRequestInputRouter';

export interface IDaemonWireRequestClientOptions {
  readonly abortSignal: AbortSignal;
  readonly getNextEventSequence: () => number;
  readonly interactiveSession: IInteractiveRequestSession;
  /** The `performance.now()` timestamp at which the control session read the request. */
  readonly receivedTimeMs: number;
  readonly requestId: string;
  readonly sendControlAsync: (message: DaemonControlMessage) => Promise<void>;
  readonly sendFrameAsync: (frame: IDaemonFrame) => Promise<void>;
  readonly sessionId: string;
  readonly supportsRequestAdmission: boolean;
  /** Waits for the daemon's other connections that have not sent a request yet. Resolves at once if omitted. */
  readonly waitForConnectingClientsAsync?: () => Promise<void>;
}

/** Ordered wire destination for one request owned by a control session. @internal */
export class DaemonWireRequestClient implements IDaemonRequestDispatchClient {
  readonly #getNextEventSequence: () => number;
  readonly #requestId: string;
  readonly #sendControlAsync: (message: DaemonControlMessage) => Promise<void>;
  readonly #sendFrameAsync: (frame: IDaemonFrame) => Promise<void>;
  readonly #waitForConnectingClientsAsync: (() => Promise<void>) | undefined;
  #terminalOutcomeSent: boolean = false;

  public readonly abortSignal: AbortSignal;
  public readonly interactiveSession: IInteractiveRequestSession;
  public readonly receivedTimeMs: number;
  public readonly sessionId: string;
  public readonly supportsRequestAdmission: boolean;

  public constructor(options: IDaemonWireRequestClientOptions) {
    this.abortSignal = options.abortSignal;
    this.#getNextEventSequence = options.getNextEventSequence;
    this.interactiveSession = options.interactiveSession;
    this.receivedTimeMs = options.receivedTimeMs;
    this.#requestId = options.requestId;
    this.#sendControlAsync = options.sendControlAsync;
    this.#sendFrameAsync = options.sendFrameAsync;
    this.sessionId = options.sessionId;
    this.supportsRequestAdmission = options.supportsRequestAdmission;
    this.#waitForConnectingClientsAsync = options.waitForConnectingClientsAsync;
  }

  public getNextEventSequence(): number {
    return this.#getNextEventSequence();
  }

  public async waitForConnectingClientsAsync(): Promise<void> {
    await this.#waitForConnectingClientsAsync?.();
  }

  public get terminalOutcomeSent(): boolean {
    return this.#terminalOutcomeSent;
  }

  public writeEventAsync(event: IDaemonEventEnvelope): Promise<void> {
    return this.#sendFrameAsync({
      kind: DaemonFrameType.event,
      payload: encodeDaemonEventFrame(event)
    });
  }

  public writeLogChunkAsync(
    operationId: string,
    stream: 'stdout' | 'stderr',
    chunk: Uint8Array
  ): Promise<void> {
    return this.#writeLogAsync(operationId, stream, chunk);
  }

  public writeTerminalChunkAsync(stream: 'stdout' | 'stderr', chunk: Uint8Array): Promise<void> {
    return this.#writeLogAsync(this.#requestId, stream, chunk);
  }

  public writeQueuePositionAsync(message: IDaemonRequestQueuePositionMessage): Promise<void> {
    return this.#sendControlAsync(message);
  }

  public writeResultAsync(
    result: IDaemonCommandResult | IDaemonPhasedRequestResult
  ): Promise<void> {
    this.#claimTerminalOutcome();
    return this.#sendControlAsync({ kind: 'requestResult', payload: result });
  }

  public writeTerminalPolicyAsync(result: IDaemonTerminalPolicyResult): Promise<void> {
    this.#claimTerminalOutcome();
    return this.#sendControlAsync({ kind: 'terminalPolicy', payload: result });
  }

  public writeRejectionAsync(
    code: DaemonRequestRejectionCode,
    message: string
  ): Promise<void> {
    this.#claimTerminalOutcome();
    return this.#sendControlAsync({
      kind: 'requestRejected',
      payload: { code, message, requestId: this.#requestId }
    });
  }

  #writeLogAsync(
    operationId: string,
    stream: 'stdout' | 'stderr',
    chunk: Uint8Array
  ): Promise<void> {
    return this.#sendFrameAsync({
      kind: stream === 'stdout' ? DaemonFrameType.logStdout : DaemonFrameType.logStderr,
      payload: encodeDaemonLogChunk({ chunk, operationId })
    });
  }

  #claimTerminalOutcome(): void {
    if (this.#terminalOutcomeSent) {
      throw new Error(`Request "${this.#requestId}" already produced a terminal wire outcome.`);
    }
    this.#terminalOutcomeSent = true;
  }
}
