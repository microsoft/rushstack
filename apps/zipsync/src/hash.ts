// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { readSync, fstatSync, type Stats } from 'node:fs';
import { createHash, type Hash } from 'node:crypto';

const buffer: Buffer = Buffer.allocUnsafeSlow(1 << 24);

export function computeFileHash(fd: number): string | false {
  try {
    const hash: Hash = createHash('sha1');
    let totalBytesRead: number = 0;
    let bytesRead: number;
    do {
      bytesRead = readSync(fd, buffer, 0, buffer.length, -1);
      if (bytesRead <= 0) {
        break;
      }
      totalBytesRead += bytesRead;
      hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead > 0);
    if (totalBytesRead === 0) {
      // Sometimes directories get treated as empty files
      const stat: Stats = fstatSync(fd);
      if (!stat.isFile()) {
        return false;
      }
    }

    return hash.digest('hex');
  } catch (err) {
    // There is a bug in node-core-library where it doesn't handle if the operation was on a file descriptor
    if (err.code === 'EISDIR' || err.code === 'ENOENT' || err.code === 'ENOTDIR') {
      return false;
    }
    throw err;
  }
}

export function calculateSHA1(data: Buffer): string {
  return createHash('sha1').update(data).digest('hex');
}
