// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// Hash functions vendored from pnpm to avoid transitive dependencies.
//
// createBase32Hash (MD5 base32, used by pnpm 8 and 9):
//   https://github.com/pnpm/pnpm/blob/afe8ecef1f24812845b699c141d52643d1524079/packages/crypto.base32-hash/src/index.ts
// base32 encoding (from rfc4648):
//   https://github.com/swansontec/rfc4648.js/blob/ead9c9b4b68e5d4a529f32925da02c02984e772c/src/codec.ts#L82-L118
//
// createShortSha256Hash (SHA-256 hex truncated to 32 chars, used by pnpm 10):
//   https://github.com/pnpm/pnpm/blob/42ecf04fd0e442af8610ae4231855e004732dbf7/crypto/hash/src/index.ts

import { createHash } from 'node:crypto';

const BASE32: string[] = 'abcdefghijklmnopqrstuvwxyz234567'.split('');

export function createBase32Hash(input: string): string {
  const data: Buffer = createHash('md5').update(input).digest();

  const mask: 0x1f = 0x1f;
  let out: string = '';

  let bits: number = 0;
  let buffer: number = 0;
  for (let i: number = 0; i < data.length; ++i) {
    // eslint-disable-next-line no-bitwise
    buffer = (buffer << 8) | (0xff & data[i]);
    bits += 8;

    while (bits > 5) {
      bits -= 5;
      // eslint-disable-next-line no-bitwise
      out += BASE32[mask & (buffer >> bits)];
    }
  }

  if (bits) {
    // eslint-disable-next-line no-bitwise
    out += BASE32[mask & (buffer << (5 - bits))];
  }

  return out;
}

export function createShortSha256Hash(input: string): string {
  return createHash('sha256').update(input).digest('hex').substring(0, 32);
}
