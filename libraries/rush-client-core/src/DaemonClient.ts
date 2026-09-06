// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { Readable } from 'node:stream';

import {
  DAEMON_INPUT_LIFECYCLE_PROTOCOL_MINOR,
  DAEMON_LIFECYCLE_PROTOCOL_MINOR,
  DAEMON_PROTOCOL_VERSION,
  DAEMON_REQUEST_LIFECYCLE_PROTOCOL_MINOR,
  DaemonFrameType,
  DaemonProtocolError,
  decodeDaemonControlMessage,
  decodeDaemonEventFrame,
  decodeDaemonLogChunk,
  encodeDaemonControlMessage,
  encodeDaemonStdinChunk,
  type DaemonControlMessage,
  type IDaemonClientCaps,
  type IDaemonCommandResult,
  type IDaemonEventEnvelope,
  type IDaemonFrame,
  type IDaemonPongMessage,
  type IDaemonProtocolVersion,
  type IDaemonRequestEnvelope,
  type IDaemonRequestRejectedMessage
} from '@rushstack/rush-daemon-protocol';
import { connectDaemonAsync, type DaemonFrameConnection } from '@rushstack/rush-daemon-transport';

import { DaemonClientError } from './DaemonClientError';

const MAX_STDIN_CHUNK_BYTES: number = 64 * 1024;

/** Options for a fresh connection; readiness includes both hello and ping. @beta */
export interface IDaemonClientConnectOptions {
  readonly socketPath: string;
  readonly capabilities?: IDaemonClientCaps;
  readonly expectedDaemonVersion?: string;
  /** Deadline for connection and handshake, in milliseconds. Defaults to 5000. */
  readonly timeoutMs?: number;
}

/** One request's backpressured destinations. Callback order is wire order. @beta */
export interface IDaemonClientExecuteOptions {
  readonly request: IDaemonRequestEnvelope;
  readonly onStdoutAsync?: (bytes: Uint8Array, operationId: string) => Promise<void>;
  readonly onStderrAsync?: (bytes: Uint8Array, operationId: string) => Promise<void>;
  readonly onEventAsync?: (event: IDaemonEventEnvelope) => Promise<void>;
  readonly onQueuePositionAsync?: (position: number) => Promise<void>;
  readonly abortSignal?: AbortSignal;
  /** Protocol 0.7 input waits for stdinReady credits; older peers use the legacy raw-mode/terminal policy. */
  readonly stdin?: Readable;
  /** Requires negotiated stdin admission and EOF; older peers fall back before requestStart or input consumption. */
  readonly requiresStdinEnd?: boolean;
  readonly setRawMode?: (enabled: boolean) => void;
  readonly initialRawMode?: boolean;
  /** Treat a raw Ctrl+C byte as request cancellation. Defaults to false, preserving arbitrary input bytes. */
  readonly cancelOnCtrlC?: boolean;
  /** Time allowed to finish cancellation. Defaults to 5000 milliseconds. */
  readonly cancellationTimeoutMs?: number;
}

/** Only explicit, pre-execution rejections permit in-process fallback. @beta */
export type DaemonClientOutcome =
  | { readonly kind: 'result'; readonly result: IDaemonCommandResult }
  | {
      readonly kind: 'fallback';
      readonly reason: 'unsupported' | 'controllingTerminalRequired' | 'stdinEndUnsupported';
      readonly message?: string;
    }
  | { readonly kind: 'rejected'; readonly rejection: IDaemonRequestRejectedMessage['payload'] };

interface IDeferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (error: Error) => void;
}

function deferred<T>(): IDeferred<T> {
  let resolveDeferred!: (value: T) => void;
  let rejectDeferred!: (error: Error) => void;
  const promise: Promise<T> = new Promise((resolve, reject) => {
    resolveDeferred = resolve;
    rejectDeferred = reject;
  });
  return { promise, resolve: resolveDeferred, reject: rejectDeferred };
}

/**
 * A single-invocation client. Always closes after execution; request IDs are never recycled.
 * @remarks No command parsing, process-global environment changes, or terminal rendering occurs here.
 * @beta
 */
export class DaemonClient {
  readonly #connection: DaemonFrameConnection;
  readonly #ready: IDeferred<IDaemonPongMessage['payload']> = deferred();
  readonly #connectOptions: IDaemonClientConnectOptions;
  #peerProtocolVersion: IDaemonProtocolVersion | undefined;
  #used: boolean = false;
  #result: IDeferred<DaemonClientOutcome> | undefined;
  #shutdown: IDeferred<void> | undefined;
  #shutdownAcknowledged: boolean = false;
  #execution: IDaemonClientExecuteOptions | undefined;
  #finished: boolean = false;
  #inputStarted: boolean = false;
  #inputAdmitted: boolean = false;
  #inputEnded: boolean = false;
  #supportsInputLifecycle: boolean = false;
  #inputAcknowledgement: IDeferred<void> | undefined;
  #inputTail: Promise<void> = Promise.resolve();
  #rawModeChanged: boolean = false;
  #sendTail: Promise<void> = Promise.resolve();
  #cancelTimer: ReturnType<typeof setTimeout> | undefined;
  #cancelSent: boolean = false;
  #wasInputPaused: boolean = true;

  private constructor(connection: DaemonFrameConnection, options: IDaemonClientConnectOptions) {
    this.#connection = connection;
    this.#connectOptions = options;
    connection.onFrame((frame) => this.#onFrameAsync(frame));
    connection.onClosed((error) => {
      if (this.#shutdown && this.#shutdownAcknowledged && !error) {
        this.#shutdown.resolve(undefined);
        return;
      }
      this.#fail(
        error ??
          new DaemonClientError(
            'disconnected',
            this.#shutdown
              ? 'Daemon disconnected before acknowledging shutdown.'
              : 'Daemon disconnected before delivering a result; the command was not retried.'
          )
      );
    });
  }

  public static async connectAsync(options: IDaemonClientConnectOptions): Promise<DaemonClient> {
    const timeoutMs: number = options.timeoutMs ?? 5000;
    validateTimeout(timeoutMs);
    const started: number = Date.now();
    const connection: DaemonFrameConnection = await connectDaemonAsync(options.socketPath, {
      connectTimeoutMs: timeoutMs
    });
    const client: DaemonClient = new DaemonClient(connection, options);
    const timer: ReturnType<typeof setTimeout> = setTimeout(
      () => {
        connection.abort(
          new DaemonClientError(
            'timeout',
            `Daemon at ${options.socketPath} did not complete hello/ping readiness within ${timeoutMs}ms.`
          )
        );
      },
      Math.max(1, timeoutMs - (Date.now() - started))
    );
    try {
      // Observe readiness before a send failure can reject it.
      await Promise.all([
        client.#ready.promise,
        client.#sendControlAsync({ kind: 'hello', payload: { protocolVersion: DAEMON_PROTOCOL_VERSION } })
      ]);
      return client;
    } catch (error) {
      await client.closeAsync();
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  /** The reply that proved this connection ready. */
  public get status(): Promise<IDaemonPongMessage['payload']> {
    return this.#ready.promise;
  }

  /** The common protocol version established by hello. */
  public get protocolVersion(): IDaemonProtocolVersion {
    return this.#peerProtocolVersion!;
  }

  /**
   * Requests shutdown on a fresh connection and waits for acknowledgement followed by EOF.
   * @remarks This confirms acceptance and connection closure, not successful workspace cleanup.
   * Requires protocol 0.6. The timeout defaults to 15000 milliseconds.
   */
  public async shutdownAsync(timeoutMs: number = 15000): Promise<void> {
    if (this.#used) throw new Error('Create a fresh DaemonClient for shutdown.');
    this.#used = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      validateTimeout(timeoutMs);
      if (this.protocolVersion.minor < DAEMON_LIFECYCLE_PROTOCOL_MINOR) {
        throw new DaemonClientError('versionMismatch', 'Daemon shutdown requires protocol 0.6 or newer.');
      }
      this.#shutdown = deferred();
      timer = setTimeout(() => {
        this.#connection.abort(
          new DaemonClientError(
            'timeout',
            'Timed out waiting for shutdown acknowledgement and EOF; no PID was signaled.'
          )
        );
      }, timeoutMs);
      await Promise.all([this.#shutdown.promise, this.#sendControlAsync({ kind: 'shutdown', payload: {} })]);
    } finally {
      clearTimeout(timer);
      await this.closeAsync();
    }
  }

  /** Executes once, relays the result after output drains, and restores terminal state on every exit. */
  public async executeAsync(options: IDaemonClientExecuteOptions): Promise<DaemonClientOutcome> {
    if (this.#used) throw new Error('Create a fresh DaemonClient for each invocation.');
    this.#used = true;
    this.#execution = options;
    const cancel = (): void => this.#cancel();
    options.abortSignal?.addEventListener('abort', cancel, { once: true });
    try {
      validateTimeout(options.cancellationTimeoutMs ?? 5000);
      if (options.stdin?.readableEncoding) {
        throw new Error('Daemon stdin must supply raw bytes; do not use setEncoding().');
      }
      if (options.requiresStdinEnd && (!options.stdin || !options.request.terminal.acceptsStdin)) {
        throw new Error('requiresStdinEnd requires a stdin source and an input-capable request.');
      }
      if (options.abortSignal?.aborted) {
        return {
          kind: 'result',
          result: { requestId: options.request.requestId, exitCode: 130, outcome: 'aborted', aborted: true }
        };
      }
      if (options.requiresStdinEnd && !this.#supportsInputLifecycle) {
        return {
          kind: 'fallback',
          reason: 'stdinEndUnsupported',
          message: 'The daemon does not support stdin admission and EOF; no request was sent.'
        };
      }
      this.#result = deferred();
      await Promise.all([
        this.#sendControlAsync({ kind: 'requestStart', payload: options.request }),
        this.#result.promise
      ]);
      return await this.#result.promise;
    } finally {
      this.#finished = true;
      clearTimeout(this.#cancelTimer);
      options.abortSignal?.removeEventListener('abort', cancel);
      this.#stopInput();
      try {
        if (this.#rawModeChanged) options.setRawMode?.(options.initialRawMode ?? false);
      } finally {
        await this.closeAsync();
      }
    }
  }

  public async closeAsync(): Promise<void> {
    await this.#connection.closeAsync();
  }

  #cancel(): void {
    if (this.#cancelSent || this.#finished || !this.#execution) return;
    this.#cancelSent = true;
    this.#stopInput();
    this.#cancelTimer = setTimeout(() => {
      this.#connection.abort(
        new DaemonClientError(
          'timeout',
          'Daemon did not finish cancellation; disconnected without retrying the command.'
        )
      );
    }, this.#execution.cancellationTimeoutMs ?? 5000);
    void this.#sendControlAsync({
      kind: 'requestCancel',
      payload: { requestId: this.#execution.request.requestId }
    }).catch((error: Error) => this.#fail(error));
  }

  async #onFrameAsync(frame: IDaemonFrame): Promise<void> {
    if (frame.kind === DaemonFrameType.controlJson) {
      await this.#onControlAsync(decodeDaemonControlMessage(frame.payload));
      return;
    }
    const execution: IDaemonClientExecuteOptions = this.#requireExecution();
    if (frame.kind === DaemonFrameType.event) {
      await execution.onEventAsync?.(decodeDaemonEventFrame(frame.payload));
    } else if (frame.kind === DaemonFrameType.logStdout || frame.kind === DaemonFrameType.logStderr) {
      const { chunk, operationId } = decodeDaemonLogChunk(frame.payload);
      const sink: IDaemonClientExecuteOptions['onStdoutAsync'] =
        frame.kind === DaemonFrameType.logStdout ? execution.onStdoutAsync : execution.onStderrAsync;
      if (!sink) throw new Error('A daemon output stream has no destination.');
      await sink(chunk, operationId);
    } else {
      throw new DaemonProtocolError('malformedControlMessage', 'Unexpected input frame from daemon.');
    }
  }

  async #onControlAsync(message: DaemonControlMessage): Promise<void> {
    if (message.kind === 'error')
      throw new DaemonProtocolError(message.payload.code, message.payload.message);
    if (!this.#peerProtocolVersion) {
      if (message.kind !== 'helloAck') throw new Error('Expected daemon helloAck.');
      const version: IDaemonProtocolVersion = message.payload.protocolVersion;
      if (
        version.major !== DAEMON_PROTOCOL_VERSION.major ||
        version.minor < DAEMON_REQUEST_LIFECYCLE_PROTOCOL_MINOR
      ) {
        throw new DaemonClientError(
          'versionMismatch',
          'Daemon does not support the required request lifecycle protocol; restart it with a matching version.'
        );
      }
      this.#peerProtocolVersion = Object.freeze({
        major: version.major,
        minor: Math.min(version.minor, DAEMON_PROTOCOL_VERSION.minor)
      });
      this.#supportsInputLifecycle =
        this.#peerProtocolVersion.minor >= DAEMON_INPUT_LIFECYCLE_PROTOCOL_MINOR &&
        this.#connectOptions.capabilities?.supportsInputLifecycle !== false;
      await this.#sendControlAsync({
        kind: 'subscribe',
        payload: {
          ...this.#connectOptions.capabilities,
          isTTY: this.#connectOptions.capabilities?.isTTY ?? false,
          supportsInteractiveIO: true,
          supportsInputLifecycle: this.#supportsInputLifecycle,
          supportsRequestAdmission: true,
          supportsRequestLifecycle: true
        }
      });
      await this.#sendControlAsync({ kind: 'ping', payload: {} });
      return;
    }
    if (message.kind === 'pong' && !this.#used) {
      const expected: string | undefined = this.#connectOptions.expectedDaemonVersion;
      if (expected !== undefined && message.payload.daemonVersion !== expected) {
        throw new DaemonClientError(
          'versionMismatch',
          `Expected daemon ${expected}, received ${message.payload.daemonVersion ?? 'unknown'}. Stop the old daemon before retrying; no PID was killed.`
        );
      }
      this.#ready.resolve(message.payload);
      return;
    }
    if (message.kind === 'shutdownAck') {
      if (!this.#shutdown || this.#shutdownAcknowledged) {
        throw new DaemonProtocolError('malformedControlMessage', 'Unexpected shutdown acknowledgement.');
      }
      this.#shutdownAcknowledged = true;
      return;
    }
    const execution: IDaemonClientExecuteOptions = this.#requireExecution();
    if (!('requestId' in message.payload) || message.payload.requestId !== execution.request.requestId) {
      throw new DaemonProtocolError(
        'malformedControlMessage',
        'Daemon control does not belong to the active request.'
      );
    }
    switch (message.kind) {
      case 'requestResult':
        this.#complete({ kind: 'result', result: message.payload });
        return;
      case 'requestRejected':
        this.#complete(
          message.payload.code === 'unsupported'
            ? { kind: 'fallback', reason: 'unsupported', message: message.payload.message }
            : { kind: 'rejected', rejection: message.payload }
        );
        return;
      case 'terminalPolicy':
        if (message.payload.decision === 'requiresInProcess') {
          this.#complete({ kind: 'fallback', reason: 'controllingTerminalRequired' });
        } else {
          if (!this.#supportsInputLifecycle) this.#startInput();
        }
        return;
      case 'setRawMode':
        if (!execution.setRawMode)
          throw new Error('Daemon requested raw mode from a client without terminal control.');
        execution.setRawMode(message.payload.enabled);
        this.#rawModeChanged = true;
        await this.#sendControlAsync({ kind: 'rawModeChanged', payload: message.payload });
        if (!this.#supportsInputLifecycle) {
          if (message.payload.enabled) this.#startInput();
          else this.#stopInput();
        }
        return;
      case 'stdinReady':
        if (!this.#supportsInputLifecycle) {
          throw new DaemonProtocolError('malformedControlMessage', 'Unexpected stdin admission.');
        }
        if (!this.#inputAdmitted) {
          this.#inputAdmitted = true;
          this.#startInput();
        } else if (this.#inputAcknowledgement) {
          const acknowledgement: IDeferred<void> = this.#inputAcknowledgement;
          this.#inputAcknowledgement = undefined;
          acknowledgement.resolve(undefined);
        } else {
          throw new DaemonProtocolError('malformedControlMessage', 'Unexpected stdin write acknowledgement.');
        }
        return;
      case 'queuePosition':
        await execution.onQueuePositionAsync?.(message.payload.position);
        return;
      default:
        throw new DaemonProtocolError(
          'malformedControlMessage',
          `Unexpected daemon control: ${message.kind}.`
        );
    }
  }

  #requireExecution(): IDaemonClientExecuteOptions {
    if (!this.#execution || this.#finished)
      throw new Error('Daemon sent request output outside an active request.');
    return this.#execution;
  }

  #complete(outcome: DaemonClientOutcome): void {
    this.#finished = true;
    this.#stopInput();
    this.#inputAcknowledgement?.resolve(undefined);
    this.#inputAcknowledgement = undefined;
    this.#result!.resolve(outcome);
  }

  #fail(error: Error): void {
    this.#inputAcknowledgement?.reject(error);
    this.#inputAcknowledgement = undefined;
    this.#ready.reject(error);
    this.#result?.reject(error);
    this.#shutdown?.reject(error);
  }

  async #sendControlAsync(message: DaemonControlMessage): Promise<void> {
    return this.#sendFrameAsync({
      kind: DaemonFrameType.controlJson,
      payload: encodeDaemonControlMessage(message)
    });
  }

  #sendFrameAsync(frame: IDaemonFrame): Promise<void> {
    this.#sendTail = this.#sendTail.then(() => this.#connection.sendFrameAsync(frame));
    return this.#sendTail;
  }

  readonly #onInput = (chunk: Buffer): void => {
    const execution: IDaemonClientExecuteOptions = this.#requireExecution();
    if (execution.cancelOnCtrlC && chunk.includes(3)) {
      this.#cancel();
      return;
    }
    execution.stdin!.pause();
    this.#inputTail = this.#sendInputAsync(chunk);
    void this.#inputTail
      .then(() => {
        if (this.#inputStarted && !this.#finished) execution.stdin!.resume();
      })
      .catch((error: Error) => this.#connection.abort(error));
  };

  async #sendInputAsync(chunk: Uint8Array): Promise<void> {
    for (let offset: number = 0; offset < chunk.byteLength; offset += MAX_STDIN_CHUNK_BYTES) {
      if (this.#finished || this.#cancelSent) return;
      const acknowledgement: IDeferred<void> | undefined = this.#supportsInputLifecycle
        ? deferred<void>()
        : undefined;
      this.#inputAcknowledgement = acknowledgement;
      await Promise.all([
        this.#sendFrameAsync({
          kind: DaemonFrameType.stdin,
          payload: encodeDaemonStdinChunk({
            requestId: this.#execution!.request.requestId,
            chunk: chunk.subarray(offset, offset + MAX_STDIN_CHUNK_BYTES)
          })
        }),
        acknowledgement?.promise
      ]);
    }
  }

  readonly #onInputError = (error: Error): void => this.#connection.abort(error);

  readonly #onInputEnd = (): void => {
    if (!this.#inputStarted || this.#inputEnded || this.#finished) return;
    this.#inputEnded = true;
    this.#stopInput();
    void this.#inputTail.then(async () => {
      if (this.#finished || this.#cancelSent) return;
      await this.#sendControlAsync({
        kind: 'stdinEnd',
        payload: { requestId: this.#execution!.request.requestId }
      });
    }).catch((error: Error) => this.#connection.abort(error));
  };

  #startInput(): void {
    const execution: IDaemonClientExecuteOptions = this.#requireExecution();
    if (this.#inputStarted || this.#inputEnded || !execution.stdin || !execution.request.terminal.acceptsStdin) return;
    if (execution.stdin.destroyed && !execution.stdin.readableEnded) {
      throw new Error('Daemon stdin closed before admission without reaching EOF.');
    }
    this.#wasInputPaused = execution.stdin.isPaused();
    this.#inputStarted = true;
    execution.stdin.on('data', this.#onInput);
    execution.stdin.on('error', this.#onInputError);
    if (this.#supportsInputLifecycle) {
      execution.stdin.once('end', this.#onInputEnd);
      if (execution.stdin.readableEnded) {
        this.#onInputEnd();
        return;
      }
    }
    execution.stdin.resume();
  }

  #stopInput(): void {
    if (!this.#inputStarted) return;
    this.#inputStarted = false;
    const stdin: Readable = this.#execution!.stdin!;
    stdin.pause();
    stdin.removeListener('data', this.#onInput);
    stdin.removeListener('error', this.#onInputError);
    stdin.removeListener('end', this.#onInputEnd);
    if (!this.#wasInputPaused && stdin.listenerCount('data') > 0) stdin.resume();
  }
}

function validateTimeout(timeoutMs: number): void {
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 0x7fffffff) {
    throw new RangeError('Client timeout must be an integer between 1 and 2147483647 milliseconds.');
  }
}
