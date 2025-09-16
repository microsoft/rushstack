// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { fallbackCrc32 } from './crc32';
import * as zlib from 'zlib';

describe('crc32', () => {
  it('fallbackCrc32 should match zlib.crc32', () => {
    if (!zlib.crc32) {
      // eslint-disable-next-line no-console
      console.log('Skipping test because zlib.crc32 is not available in this Node.js version');
      return;
    }

    const testData = [
      Buffer.from('hello world', 'utf-8'),
      Buffer.alloc(0), // empty buffer
      Buffer.from('hello crc32', 'utf-8'),
      Buffer.from([-1, 2, 3, 4, 5, 255, 0, 128])
    ];

    let fallbackCrc: number = 0;
    let zlibCrc: number = 0;

    for (const data of testData) {
      fallbackCrc = fallbackCrc32(data, fallbackCrc);
      zlibCrc = zlib.crc32(data, zlibCrc);
    }

    fallbackCrc = fallbackCrc >>> 0;
    zlibCrc = zlibCrc >>> 0;

    expect(fallbackCrc).toBe(zlibCrc);
  });
});
