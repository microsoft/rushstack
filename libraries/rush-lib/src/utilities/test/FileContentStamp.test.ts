// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as fs from 'node:fs';

import {
  getFileStamp,
  getSettledBeforeNs,
  isFileStatSettled,
  SETTLED_FILE_AGE_MS
} from '../FileContentStamp';

const MS: bigint = BigInt(1e6);

function createStat(mtimeMs: number, ctimeMs: number): fs.BigIntStats {
  return {
    dev: BigInt(1),
    ino: BigInt(2),
    size: BigInt(3),
    mtimeNs: BigInt(mtimeMs) * MS + BigInt(4),
    ctimeNs: BigInt(ctimeMs) * MS + BigInt(5)
  } as fs.BigIntStats;
}

describe('FileContentStamp', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('identifies a file by identity, size and nanosecond times', () => {
    expect(getFileStamp(createStat(10, 20))).toBe('1:2:3:10000004:20000005');
  });

  it('settles files whose ctime and mtime are both older than the margin', () => {
    jest.spyOn(Date, 'now').mockReturnValue(100_000);
    const settledBeforeNs: bigint = getSettledBeforeNs();
    expect(settledBeforeNs).toBe(BigInt(100_000 - SETTLED_FILE_AGE_MS) * MS);

    const boundaryMs: number = 100_000 - SETTLED_FILE_AGE_MS;
    expect(isFileStatSettled(createStat(boundaryMs - 1, boundaryMs - 1), settledBeforeNs)).toBe(true);
    // Any time in the same millisecond as the bound is too recent.
    expect(isFileStatSettled(createStat(boundaryMs - 1, boundaryMs), settledBeforeNs)).toBe(false);
    // A future mtime set with utimes() doesn't settle a file whose ctime is old.
    expect(isFileStatSettled(createStat(200_000, boundaryMs - 1), settledBeforeNs)).toBe(false);
  });
});
