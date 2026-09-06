// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  DAEMON_PROTOCOL_VERSION,
  DaemonFrameType,
  createDaemonHello,
  decodeDaemonControlMessage,
  encodeDaemonControlMessage,
  encodeDaemonStdinChunk
} from '@rushstack/rush-daemon-protocol';
import type {
  DaemonControlMessage,
  IDaemonFrame,
  IDaemonRequestEnvelope
} from '@rushstack/rush-daemon-protocol';
import { connectDaemonAsync } from '@rushstack/rush-daemon-transport';
import type { DaemonFrameConnection } from '@rushstack/rush-daemon-transport';

import type {
  IDaemonRequestResolver,
  IResolveDaemonRequestOptions,
  ResolvedDaemonRequest
} from '../DaemonRequestDispatcher';

interface IFrameWaiter {
  readonly reject: (error: Error) => void;
  readonly resolve: (frame: IDaemonFrame) => void;
}

export interface ITerminalExchange {
  readonly frames: ReadonlyArray<IDaemonFrame>;
  readonly terminal: DaemonControlMessage;
}

export class DaemonRequestWireClient {
  readonly #connection: DaemonFrameConnection;
  readonly #frames: IDaemonFrame[] = [];
  readonly #waiters: IFrameWaiter[] = [];
  readonly #resolveClosed: () => void;
  public readonly closed: Promise<void>;

  private constructor(connection: DaemonFrameConnection) {
    this.#connection = connection;
    let resolveClosed: () => void = () => undefined;
    this.closed = new Promise((resolve) => {
      resolveClosed = resolve;
    });
    this.#resolveClosed = resolveClosed;
    connection.onFrame((frame: IDaemonFrame) => this.#receive(frame));
    connection.onClosed((error: Error | undefined) => {
      this.#closeWaiters(error);
      this.#resolveClosed();
    });
  }

  public static async connectAsync(socketPath: string): Promise<DaemonRequestWireClient> {
    return new DaemonRequestWireClient(await connectDaemonAsync(socketPath));
  }

  public async handshakeAsync(): Promise<void> {
    await this.sendControlAsync(createDaemonHello(DAEMON_PROTOCOL_VERSION));
    expect((await this.readControlAsync()).kind).toBe('helloAck');
    await this.sendControlAsync({
      kind: 'subscribe',
      payload: {
        isTTY: true,
        supportsInteractiveIO: true,
        supportsRequestAdmission: true,
        supportsRequestLifecycle: true
      }
    });
    await this.sendControlAsync({ kind: 'ping', payload: {} });
    expect((await this.readControlAsync()).kind).toBe('pong');
  }

  public sendControlAsync(message: DaemonControlMessage): Promise<void> {
    return this.#connection.sendFrameAsync({
      kind: DaemonFrameType.controlJson,
      payload: encodeDaemonControlMessage(message)
    });
  }

  public sendStdinAsync(requestId: string, chunk: Uint8Array): Promise<void> {
    return this.#connection.sendFrameAsync({
      kind: DaemonFrameType.stdin,
      payload: encodeDaemonStdinChunk({ chunk, requestId })
    });
  }

  public async readControlAsync(): Promise<DaemonControlMessage> {
    const frame: IDaemonFrame = await this.readFrameAsync();
    if (frame.kind !== DaemonFrameType.controlJson) {
      throw new Error(`Expected a control frame but received frame kind ${frame.kind}.`);
    }
    return decodeDaemonControlMessage(frame.payload);
  }

  public readFrameAsync(): Promise<IDaemonFrame> {
    const frame: IDaemonFrame | undefined = this.#frames.shift();
    if (frame) return Promise.resolve(frame);
    return new Promise((resolve, reject) => this.#waiters.push({ reject, resolve }));
  }

  public async readTerminalAsync(requestId: string): Promise<ITerminalExchange> {
    const frames: IDaemonFrame[] = [];
    for (;;) {
      const frame: IDaemonFrame = await this.readFrameAsync();
      frames.push(frame);
      if (frame.kind !== DaemonFrameType.controlJson) continue;
      const message: DaemonControlMessage = decodeDaemonControlMessage(frame.payload);
      if (isTerminalForRequest(message, requestId)) return { frames, terminal: message };
    }
  }

  public closeAsync(): Promise<void> {
    return this.#connection.closeAsync();
  }

  #receive(frame: IDaemonFrame): void {
    const waiter: IFrameWaiter | undefined = this.#waiters.shift();
    if (waiter) waiter.resolve(frame);
    else this.#frames.push(frame);
  }

  #closeWaiters(error: Error | undefined): void {
    const reason: Error = error ?? new Error('The test daemon connection closed.');
    for (const waiter of this.#waiters.splice(0)) waiter.reject(reason);
  }
}

export class CallbackDaemonRequestResolver implements IDaemonRequestResolver {
  readonly #callback: (options: IResolveDaemonRequestOptions) => Promise<ResolvedDaemonRequest>;
  readonly #onDispose: (() => Promise<void>) | undefined;

  public constructor(
    callback: (options: IResolveDaemonRequestOptions) => Promise<ResolvedDaemonRequest>,
    onDispose?: () => Promise<void>
  ) {
    this.#callback = callback;
    this.#onDispose = onDispose;
  }

  public resolveRequestAsync(options: IResolveDaemonRequestOptions): Promise<ResolvedDaemonRequest> {
    return this.#callback(options);
  }

  public [Symbol.asyncDispose](): Promise<void> {
    return this.#onDispose?.() ?? Promise.resolve();
  }
}

export interface IDeferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
}

export function createDeferred<T>(): IDeferred<T> {
  let resolvePromise: (value: T) => void = () => undefined;
  const promise: Promise<T> = new Promise((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

export function createWireEnvelope(
  requestId: string,
  commandName: string,
  cwd: string,
  overrides: Partial<IDaemonRequestEnvelope> = {}
): IDaemonRequestEnvelope {
  return {
    argv: [commandName],
    commandName,
    commandOrigin: 'custom',
    cwd,
    environment: {},
    requestId,
    terminal: { isTTY: true, supportsColor: true },
    ...overrides
  };
}

function isTerminalForRequest(message: DaemonControlMessage, requestId: string): boolean {
  if (message.kind === 'requestResult' || message.kind === 'requestRejected') {
    return message.payload.requestId === requestId;
  }
  return message.kind === 'terminalPolicy' && message.payload.requestId === requestId;
}
