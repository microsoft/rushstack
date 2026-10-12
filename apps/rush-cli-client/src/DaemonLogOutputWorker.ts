// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { write } from 'node:fs';

import { LOG_OUTPUT_FD, MAX_LOG_OUTPUT_BYTES, type LogOutputResponse } from './DaemonLogOutputProtocol';

let writing: boolean = false;
let finishing: boolean = false;

function terminate(): void {
  // This process owns only a duplicate output descriptor. A blocked filesystem write cannot be
  // cancelled by JavaScript; terminating this isolated writer also handles an abruptly lost parent.
  process.kill(process.pid, 'SIGKILL');
}

function send(message: LogOutputResponse, completed?: () => void): void {
  if (!process.send || !process.connected) {
    terminate();
    return;
  }
  process.send(message, (error: Error | null) => {
    if (error) terminate();
    else completed?.();
  });
}

function fail(error: Error & { code?: string }): void {
  if (finishing) return;
  finishing = true;
  process.exitCode = 1;
  send({ kind: 'error', message: error.message, code: error.code }, () => {
    if (writing) terminate();
    else process.disconnect!();
  });
}

async function writeAllAsync(bytes: Uint8Array): Promise<void> {
  let offset: number = 0;
  while (offset < bytes.byteLength) {
    const count: number = await new Promise((resolve, reject) => {
      write(LOG_OUTPUT_FD, bytes, offset, bytes.byteLength - offset, null, (error, written) => {
        if (error) reject(error);
        else resolve(written);
      });
    });
    if (count <= 0) throw new Error('Daemon log output made no write progress.');
    offset += count;
  }
}

process.once('disconnect', () => {
  if (!finishing || writing) terminate();
});

process.on('message', (message: unknown) => {
  if (finishing) return;
  if (typeof message !== 'object' || message === null || !('kind' in message)) {
    fail(new Error('Invalid daemon log output request.'));
    return;
  }
  if (message.kind === 'end' && !writing) {
    finishing = true;
    process.exitCode = 0;
    process.disconnect!();
    return;
  }
  if (
    message.kind !== 'write' ||
    writing ||
    !('bytes' in message) ||
    !(message.bytes instanceof Uint8Array) ||
    message.bytes.byteLength > MAX_LOG_OUTPUT_BYTES
  ) {
    fail(new Error('Daemon log output requires one bounded write at a time.'));
    return;
  }
  const bytes: Uint8Array = message.bytes;
  writing = true;
  void writeAllAsync(bytes).then(
    () => {
      writing = false;
      if (!finishing) send({ kind: 'written', byteLength: bytes.byteLength });
    },
    (error: Error) => {
      writing = false;
      fail(error);
    }
  );
});

send({ kind: 'ready' });
