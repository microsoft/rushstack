// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { constants, type Stats } from 'node:fs';
import { open, type FileHandle } from 'node:fs/promises';

import { getDaemonLogFilePath } from '@rushstack/rush-client-core';
import type { IDaemonPaths } from '@rushstack/rush-daemon-transport';

import { writeStreamAsync } from './writeStreamAsync';

const READ_BUFFER_BYTES: number = 64 * 1024;

/** Prints a fixed-size snapshot without connecting to or starting the daemon. */
export async function printDaemonLogAsync(paths: IDaemonPaths): Promise<void> {
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
    while (position < stats.size) {
      const { bytesRead } = await file.read(
        buffer,
        0,
        Math.min(buffer.length, stats.size - position),
        position
      );
      if (bytesRead === 0)
        throw new Error(`Launcher log was truncated while reading ${logFilePath}; retry the command.`);
      await writeStreamAsync(process.stdout, buffer.subarray(0, bytesRead));
      position += bytesRead;
    }
  } finally {
    await file.close();
  }
}
