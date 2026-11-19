// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'node:os';

/**
 * The exit code of a command that stopped because the process reading its output exited: 128 + SIGPIPE, which a
 * shell reports for a writer that SIGPIPE ended, as in `make | head`. Windows has no SIGPIPE; the code is the same.
 */
export const CLOSED_OUTPUT_EXIT_CODE: number = 128 + (os.constants.signals.SIGPIPE ?? 13);

export type StandardOutputStreamName = 'stdout' | 'stderr';

/**
 * A standard output stream whose reader exited.
 */
export interface IClosedStandardOutput {
  readonly streamName: StandardOutputStreamName;
  /** The code of the error that showed it: EPIPE for a pipe, or ECONNRESET for a socket. */
  readonly code: string;
}

/**
 * The part of a stream that {@link StandardOutputClosure} uses.
 */
export interface IStandardOutputClosureStream {
  on(event: 'error', listener: (error: Error) => void): unknown;
  listenerCount(event: 'error'): number;
}

/**
 * The part of `process` that {@link StandardOutputClosure} uses.
 */
export interface IStandardOutputClosureProcess {
  readonly stdout: IStandardOutputClosureStream;
  readonly stderr: IStandardOutputClosureStream;
  exitCode?: number | string | undefined;
  on(event: 'exit', listener: () => void): unknown;
  on(event: 'uncaughtExceptionMonitor', listener: () => void): unknown;
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
 * Formats the stderr line of a command that stops because the process reading its output exited, for example
 * `rush: build cancelled, because the process reading its stdout exited (EPIPE).`
 */
export function formatClosedOutputNotice(
  commandName: string,
  closed: IClosedStandardOutput,
  operationsRunning: boolean
): string {
  const notice: string = `rush: ${commandName} cancelled, because the process reading its ${closed.streamName} exited (${closed.code}).`;
  return operationsRunning ? `${notice} Operations that already started will finish first.\n` : `${notice}\n`;
}

const installedClosures: WeakMap<IStandardOutputClosureProcess, StandardOutputClosure> = new WeakMap();

/**
 * Keeps a reader of the Rush CLI's stdout or stderr that exits early, for example `head` in
 * `rush build | head -5`, from failing the process.
 *
 * @remarks
 * Node.js ignores SIGPIPE, so each write to a stream whose reader exited fails with EPIPE, and the stream emits the
 * error as an 'error' event. With no listener, that event ends the process with a stack trace and exit code 1. Once
 * this class is installed, those errors are expected: the first one on each stream is recorded and reported to the
 * {@link StandardOutputClosure.onClosed} listeners, and later ones are ignored. The process then exits with code
 * 141, as a shell reports for a writer that SIGPIPE ended, unless it crashes with an uncaught exception or an
 * unhandled rejection. Any other stream error still fails the process.
 *
 * Only the Rush CLI (`Rush.launch`) installs it. The automation API and the daemon's engine leave the process's
 * streams to their host.
 */
export class StandardOutputClosure {
  readonly #target: IStandardOutputClosureProcess;
  readonly #closed: IClosedStandardOutput[] = [];
  readonly #listeners: Set<(closed: IClosedStandardOutput) => void> = new Set();

  private constructor(target: IStandardOutputClosureProcess) {
    this.#target = target;
  }

  /**
   * Installs the listeners on `target`'s stdout and stderr and its 'exit' and 'uncaughtExceptionMonitor' events,
   * once for each target.
   */
  public static install(target: IStandardOutputClosureProcess = process): StandardOutputClosure {
    let closure: StandardOutputClosure | undefined = installedClosures.get(target);
    if (!closure) {
      const installed: StandardOutputClosure = new StandardOutputClosure(target);
      closure = installed;
      installedClosures.set(target, installed);
      installed.#guard('stdout', target.stdout);
      installed.#guard('stderr', target.stderr);
      let crashed: boolean = false;
      target.on('uncaughtExceptionMonitor', () => {
        crashed = true;
      });
      target.on('exit', () => {
        // Node.js reads exitCode again after the 'exit' listeners, including after process.exit(code). A crash keeps
        // the exit code that Node.js gives it, so that it doesn't look like a reader that exited.
        if (installed.#closed.length && !crashed) {
          target.exitCode = CLOSED_OUTPUT_EXIT_CODE;
        }
      });
    }
    return closure;
  }

  /**
   * The first stream whose reader exited, if one has.
   */
  public get firstClosed(): IClosedStandardOutput | undefined {
    return this.#closed[0];
  }

  /**
   * Calls `listener` for each stream whose reader exits, and at once for each one whose reader already has.
   * Returns a function that removes the listener.
   */
  public onClosed(listener: (closed: IClosedStandardOutput) => void): () => void {
    this.#listeners.add(listener);
    for (const closed of [...this.#closed]) {
      if (this.#listeners.has(listener)) {
        listener(closed);
      }
    }
    return () => {
      this.#listeners.delete(listener);
    };
  }

  #guard(streamName: StandardOutputStreamName, stream: IStandardOutputClosureStream): void {
    stream.on('error', (error: Error) => {
      const code: string | undefined = getClosedOutputCode(error);
      if (code === undefined) {
        if (stream.listenerCount('error') === 1) {
          // No one else handles this error, so it fails the process, as it would without this listener.
          throw error;
        }
        return;
      }
      if (this.#closed.some((closed: IClosedStandardOutput) => closed.streamName === streamName)) {
        return;
      }
      const closed: IClosedStandardOutput = { streamName, code };
      this.#closed.push(closed);
      this.#target.exitCode = CLOSED_OUTPUT_EXIT_CODE;
      for (const listener of [...this.#listeners]) {
        listener(closed);
      }
    });
  }
}
