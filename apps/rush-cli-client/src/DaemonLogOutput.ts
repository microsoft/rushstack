// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawn, type ChildProcess } from 'node:child_process';
import * as path from 'node:path';

import { MAX_LOG_OUTPUT_BYTES, type LogOutputRequest } from './DaemonLogOutputProtocol';

interface IPendingWrite {
  readonly byteLength: number;
  readonly resolve: () => void;
  readonly reject: (reason: unknown) => void;
}

/**
 * Keeps blocking Windows stdout writes out of the CLI's event loop and thread pool.
 * One acknowledged chunk is in flight; every exit joins the output-only child.
 */
export class DaemonLogOutput {
  readonly #signal: AbortSignal | undefined;
  readonly #outputFd: number;
  readonly #failureController: AbortController = new AbortController();
  #child: ChildProcess | undefined;
  #ready: Promise<void> | undefined;
  #resolveReady: (() => void) | undefined;
  #rejectReady: ((reason: unknown) => void) | undefined;
  #pending: IPendingWrite | undefined;
  #failure: Error | undefined;
  #closed: Promise<void> = Promise.resolve();
  #closePromise: Promise<void> | undefined;
  #stopRequested: boolean = false;
  #cancelled: boolean = false;

  public constructor(signal?: AbortSignal, outputFd: number = 1) {
    this.#signal = signal;
    this.#outputFd = outputFd;
    signal?.addEventListener('abort', this.#onAbort, { once: true });
  }

  public get failureSignal(): AbortSignal {
    return this.#failureController.signal;
  }

  public get workerPid(): number | undefined {
    return this.#child?.pid;
  }

  public async writeAsync(bytes: Uint8Array): Promise<void> {
    if (bytes.byteLength > MAX_LOG_OUTPUT_BYTES)
      throw new RangeError('Daemon log output chunk is too large.');
    this.#signal?.throwIfAborted();
    this.failureSignal.throwIfAborted();
    if (this.#closePromise) throw new Error('Daemon log output is closed.');
    await this.#startAsync();
    this.#signal?.throwIfAborted();
    this.failureSignal.throwIfAborted();
    if (this.#pending) throw new Error('Daemon log output already has a pending write.');
    await new Promise<void>((resolve, reject) => {
      this.#pending = { byteLength: bytes.byteLength, resolve, reject };
      this.#send({ kind: 'write', bytes });
    });
  }

  public closeAsync(): Promise<void> {
    this.#closePromise ??= this.#closeOnceAsync();
    return this.#closePromise;
  }

  async #closeOnceAsync(): Promise<void> {
    try {
      if (this.#child && !this.#stopRequested) {
        this.#stopRequested = true;
        if (this.#signal?.aborted || this.#failure || this.#pending) {
          this.#cancelled = true;
          this.#child.kill('SIGKILL');
        } else if (this.#child.connected) {
          this.#send({ kind: 'end' });
        }
      }
      await this.#closed;
      this.failureSignal.throwIfAborted();
    } finally {
      this.#signal?.removeEventListener('abort', this.#onAbort);
    }
  }

  #startAsync(): Promise<void> {
    if (this.#ready) return this.#ready;
    this.#ready = new Promise<void>((resolve, reject) => {
      this.#resolveReady = resolve;
      this.#rejectReady = reject;
    });
    const child: ChildProcess = spawn(process.execPath, [path.join(__dirname, 'DaemonLogOutputWorker.js')], {
      stdio: ['ignore', 'ignore', 'ignore', this.#outputFd, 'ipc'],
      serialization: 'advanced',
      windowsHide: true,
      // This private I/O worker must not run user preload hooks or arbitrary user work.
      env: { ...process.env, NODE_OPTIONS: undefined }
    });
    this.#child = child;
    this.#closed = new Promise<void>((resolve) => {
      child.once('close', (code, signal) => {
        if (!this.#stopRequested || (!this.#cancelled && code !== 0)) {
          this.#fail(new Error(`Daemon log output worker exited unexpectedly (${code ?? signal}).`));
        }
        this.#pending?.reject(
          this.#failure ?? this.#signal?.reason ?? new Error('Daemon log output closed.')
        );
        this.#pending = undefined;
        resolve();
      });
    });
    child.once('error', (error) => this.#fail(error));
    child.once('spawn', () => {
      if (this.#signal?.aborted) this.#onAbort();
    });
    child.on('message', (message: unknown) => this.#onMessage(message));
    return this.#ready;
  }

  #send(message: LogOutputRequest): void {
    this.#child!.send(message, (error: Error | null) => {
      if (error && !this.#cancelled) this.#fail(error);
    });
  }

  #onMessage(message: unknown): void {
    if (this.#cancelled) return;
    if (typeof message === 'object' && message !== null && 'kind' in message) {
      if (message.kind === 'ready' && this.#resolveReady) {
        this.#resolveReady();
        this.#resolveReady = undefined;
        return;
      }
      const pending: IPendingWrite | undefined = this.#pending;
      if (
        message.kind === 'written' &&
        'byteLength' in message &&
        pending &&
        pending.byteLength === message.byteLength
      ) {
        pending.resolve();
        this.#pending = undefined;
        return;
      }
      if (message.kind === 'error' && 'message' in message && typeof message.message === 'string') {
        const error: NodeJS.ErrnoException = new Error(`Daemon log output failed: ${message.message}`);
        if ('code' in message && typeof message.code === 'string') error.code = message.code;
        this.#fail(error);
        return;
      }
    }
    this.#fail(new Error('Invalid daemon log output acknowledgement.'));
  }

  #fail(error: Error): void {
    this.#failure ??= error;
    this.#failureController.abort(this.#failure);
    this.#rejectReady?.(this.#failure);
    this.#pending?.reject(this.#failure);
    this.#pending = undefined;
    if (this.#child && !this.#stopRequested) {
      this.#stopRequested = true;
      this.#cancelled = true;
      this.#child.kill('SIGKILL');
    }
  }

  readonly #onAbort = (): void => {
    this.#cancelled = true;
    this.#rejectReady?.(this.#signal?.reason);
    this.#pending?.reject(this.#signal?.reason);
    this.#pending = undefined;
    if (this.#child) {
      this.#stopRequested = true;
      this.#child.kill('SIGKILL');
    }
  };
}
