// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';

export class WriteAllSyncError extends Error {
  public readonly bytesWritten: number;

  public constructor(cause: Error, bytesWritten: number) {
    super(cause.message, { cause });
    this.name = 'WriteAllSyncError';
    this.bytesWritten = bytesWritten;
  }
}

export function writeAllSync(fileDescriptor: number, data: string | Uint8Array): void {
  const buffer: Uint8Array = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
  let offset: number = 0;
  try {
    while (offset < buffer.byteLength) {
      const remaining: number = buffer.byteLength - offset;
      const written: number = fs.writeSync(fileDescriptor, buffer, offset, remaining);
      if (!Number.isSafeInteger(written) || written <= 0 || written > remaining) {
        throw new Error(`The output writer made invalid progress (${written} of ${remaining} bytes).`);
      }
      offset += written;
    }
  } catch (error) {
    throw new WriteAllSyncError(error instanceof Error ? error : new Error(String(error)), offset);
  }
}
