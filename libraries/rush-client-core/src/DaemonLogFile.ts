// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';

import type { IDaemonPaths } from '@rushstack/rush-daemon-transport';

const MAX_LOG_TAIL_BYTES: number = 16384;
const MAX_LOG_TAIL_LINES: number = 3;
const MAX_LOG_LINE_LENGTH: number = 500;

/** The workspace launcher's persistent stdout/stderr log, independent of daemon lifetime. @beta */
export function getDaemonLogFilePath(paths: IDaemonPaths): string {
  return `${paths.lockfilePath}.log`;
}

/** Returns the log's current size, used to scope later diagnostics to one startup attempt. */
export function getDaemonLogFileSize(paths: IDaemonPaths): number {
  return fs.statSync(getDaemonLogFilePath(paths), { throwIfNoEntry: false })?.size ?? 0;
}

/**
 * Formats the last launcher log lines written after `fromOffset`, preferring error lines and omitting
 * stack frames, so startup failures show their real cause. Returns an empty string if nothing is available.
 */
export function formatDaemonLogTail(paths: IDaemonPaths, fromOffset: number = 0): string {
  let text: string;
  try {
    const fd: number = fs.openSync(getDaemonLogFilePath(paths), 'r');
    try {
      const size: number = fs.fstatSync(fd).size;
      const start: number = Math.max(fromOffset > size ? 0 : fromOffset, size - MAX_LOG_TAIL_BYTES);
      const buffer: Buffer = Buffer.alloc(size - start);
      fs.readSync(fd, buffer, 0, buffer.length, start);
      text = buffer.toString('utf8');
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return '';
  }
  const meaningful: string[] = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('at '));
  const errors: string[] = meaningful.filter((line) => /error/i.test(line));
  const lines: string[] = (errors.length > 0 ? errors : meaningful)
    .slice(-MAX_LOG_TAIL_LINES)
    .map((line) => (line.length > MAX_LOG_LINE_LENGTH ? `${line.slice(0, MAX_LOG_LINE_LENGTH)}...` : line));
  return lines.length > 0 ? `\nLast launcher log lines:\n  ${lines.join('\n  ')}\n` : '';
}
