// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { constants, type Stats } from 'node:fs';
import { lstat, open, type FileHandle } from 'node:fs/promises';
import type { Writable } from 'node:stream';
import { setTimeout as delayAsync } from 'node:timers/promises';

import { getDaemonLogFilePath } from '@rushstack/rush-client-core';
import type { IDaemonPaths } from '@rushstack/rush-daemon-transport';

import { writeStreamAsync } from './writeStreamAsync';

const READ_BUFFER_BYTES: number = 64 * 1024;
const FOLLOW_POLL_INTERVAL_MS: number = 100;

export interface IDaemonLogOptions {
  readonly follow?: boolean;
  readonly abortSignal?: AbortSignal;
  readonly output?: Writable;
}

/** Reads a snapshot, optionally following appends, without connecting to or starting the daemon. */
export async function printDaemonLogAsync(
  paths: IDaemonPaths,
  options: IDaemonLogOptions = {}
): Promise<void> {
  if (options.abortSignal?.aborted) return;
  const logFilePath: string = getDaemonLogFilePath(paths);
  let file: FileHandle;
  try {
    // These distinct native flags have non-overlapping values.
    file = await open(
      logFilePath,
      constants.O_RDONLY + (process.platform === 'win32' ? 0 : constants.O_NOFOLLOW + constants.O_NONBLOCK)
    );
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      throw new Error(
        `No launcher log exists at ${logFilePath}. Logs are created when this client starts a daemon.`,
        { cause: error }
      );
    }
    throw error;
  }
  try {
    const stats: Stats = await file.stat();
    if (!stats.isFile() || stats.nlink !== 1) {
      throw new Error(`Launcher log must be a regular, unshared file: ${logFilePath}`);
    }
    if (!Number.isSafeInteger(stats.size) || stats.size < 0) {
      throw new Error(`Launcher log size cannot be represented safely: ${logFilePath}`);
    }
    const buffer: Buffer = Buffer.alloc(READ_BUFFER_BYTES);
    let position: number = 0;
    let size: number = stats.size;
    while (!options.abortSignal?.aborted) {
      if (position === size) {
        if (!options.follow) break;
        await waitForAppendAsync(options.abortSignal);
        if (options.abortSignal?.aborted) break;
        const current: Stats = await file.stat();
        const named: Stats = await lstat(logFilePath);
        if (current.nlink !== 1 || !named.isFile() || named.dev !== stats.dev || named.ino !== stats.ino) {
          throw new Error(
            `Launcher log was replaced or unlinked while following ${logFilePath}; reopen the log.`
          );
        }
        if (!Number.isSafeInteger(current.size) || current.size < position) {
          throw new Error(
            `Launcher log was truncated or has an invalid size while following ${logFilePath}.`
          );
        }
        size = current.size;
        continue;
      }
      const { bytesRead } = await file.read(buffer, 0, Math.min(buffer.length, size - position), position);
      if (bytesRead === 0)
        throw new Error(`Launcher log was truncated while reading ${logFilePath}; retry the command.`);
      await writeLogChunkAsync(options, buffer.subarray(0, bytesRead));
      position += bytesRead;
    }
  } catch (error) {
    if (!options.abortSignal?.aborted || error !== options.abortSignal.reason) throw error;
  } finally {
    await file.close();
  }
}

async function waitForAppendAsync(signal: AbortSignal | undefined): Promise<void> {
  try {
    await delayAsync(FOLLOW_POLL_INTERVAL_MS, undefined, { signal });
  } catch (error) {
    if (
      !signal?.aborted ||
      typeof error !== 'object' ||
      error === null ||
      !('name' in error) ||
      error.name !== 'AbortError' ||
      !('cause' in error) ||
      error.cause !== signal.reason
    )
      throw error;
  }
}

async function writeLogChunkAsync(options: IDaemonLogOptions, bytes: Uint8Array): Promise<void> {
  const output: Writable = options.output ?? process.stdout;
  const signal: AbortSignal | undefined = options.abortSignal;
  signal?.throwIfAborted();
  let onAbort: (() => void) | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      onAbort = () => {
        reject(signal!.reason);
        output.destroy(signal!.reason);
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      void writeStreamAsync(output, bytes).then(resolve, reject);
    });
  } finally {
    if (onAbort) signal?.removeEventListener('abort', onAbort);
  }
}
