// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'node:os';
import type { Writable } from 'node:stream';

import { writeStreamAsync } from './writeStreamAsync';

/**
 * The exit code of a command that stopped because the process reading its output exited: 128 + SIGPIPE, which a
 * shell reports for a writer that SIGPIPE ended, as in `make | head`. Windows has no SIGPIPE; the code is the same.
 */
export const CLOSED_OUTPUT_EXIT_CODE: number = 128 + (os.constants.signals.SIGPIPE ?? 13);

export type ClientOutputStreamName = 'stdout' | 'stderr';

export interface IClientOutputStreams {
  readonly stdout: Writable;
  readonly stderr: Writable;
}

/**
 * Returns the error code when a write failed because nothing reads the stream any more, for example after
 * `| head` exits: EPIPE for a pipe, or ECONNRESET for a socket.
 */
export function getClosedOutputCode(error: unknown): string | undefined {
  const code: unknown =
    typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
  return code === 'EPIPE' || code === 'ECONNRESET' ? code : undefined;
}

/**
 * One of the client's own output streams. Once a write shows that the stream's reader has exited, later writes
 * are dropped, and the owner hears of it once.
 */
export class ClientOutputStream {
  public readonly name: ClientOutputStreamName;
  readonly #stream: Writable;
  readonly #onClosed: (stream: ClientOutputStream) => void;
  #closedCode: string | undefined;
  #guarded: boolean = false;

  public constructor(
    name: ClientOutputStreamName,
    stream: Writable,
    onClosed: (stream: ClientOutputStream) => void
  ) {
    this.name = name;
    this.#stream = stream;
    this.#onClosed = onClosed;
  }

  /** The code of the error that showed that the stream's reader exited (for example EPIPE), if one has. */
  public get closedCode(): string | undefined {
    return this.#closedCode;
  }

  /** Resolves once the bytes are written, or dropped because the reader exited. Other write errors reject. */
  public async writeAsync(bytes: Uint8Array): Promise<void> {
    if (this.#closedCode !== undefined) return;
    try {
      await writeStreamAsync(this.#stream, bytes);
    } catch (error) {
      const code: string | undefined = getClosedOutputCode(error);
      if (code === undefined) throw error;
      this.#close(code);
    }
  }

  /**
   * Writes without waiting. Another write error is left unhandled, so that it still fails the process, as the
   * stream's unhandled 'error' event did.
   */
  public write(text: string): void {
    void this.writeAsync(Buffer.from(text));
  }

  /**
   * Node emits a failed write's error as an 'error' event too, and a stream with no listener for it fails the
   * process. This listener keeps a reader that exited from doing so.
   */
  public guard(): void {
    if (!this.#guarded) {
      this.#guarded = true;
      this.#stream.on('error', this.#onStreamError);
    }
  }

  public release(): void {
    if (this.#guarded) {
      this.#guarded = false;
      this.#stream.removeListener('error', this.#onStreamError);
    }
  }

  readonly #onStreamError = (error: Error): void => {
    const code: string | undefined = getClosedOutputCode(error);
    if (code !== undefined) {
      this.#close(code);
    } else if (this.#stream.listenerCount('error') === 1) {
      // No write waits for this error, so it fails the process, as it would without this listener.
      throw error;
    }
  };

  #close(code: string): void {
    if (this.#closedCode === undefined) {
      this.#closedCode = code;
      this.#onClosed(this);
    }
  }
}

/**
 * The client's stdout and stderr. A reader that exits (for example `rush-client build | head -5`) makes the
 * next write to its stream fail. The client then cancels a running daemon request, as SIGPIPE would stop a
 * native command, instead of reporting the failed write as a lost daemon connection.
 */
export class ClientOutput {
  public readonly stdout: ClientOutputStream;
  public readonly stderr: ClientOutputStream;
  readonly #listeners: Set<(stream: ClientOutputStream) => void> = new Set();

  public constructor(streams: IClientOutputStreams = process) {
    const onClosed = (stream: ClientOutputStream): void => {
      for (const listener of [...this.#listeners]) listener(stream);
    };
    this.stdout = new ClientOutputStream('stdout', streams.stdout, onClosed);
    this.stderr = new ClientOutputStream('stderr', streams.stderr, onClosed);
  }

  /**
   * Calls `listener` for each stream whose reader exits, and at once for one whose reader already has. Returns a
   * function that removes the listener.
   */
  public onClosed(listener: (stream: ClientOutputStream) => void): () => void {
    this.#listeners.add(listener);
    for (const stream of [this.stdout, this.stderr]) {
      if (stream.closedCode !== undefined) listener(stream);
    }
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /** Keeps a reader that exits from failing the process; see {@link ClientOutputStream.guard}. */
  public guard(): void {
    this.stdout.guard();
    this.stderr.guard();
  }

  /** Removes the listeners of `guard()`, for example before Rush runs in-process with its own error handling. */
  public release(): void {
    this.stdout.release();
    this.stderr.release();
  }
}
