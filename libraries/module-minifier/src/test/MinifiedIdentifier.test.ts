// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  getIdentifierInternal,
  getOrdinalFromIdentifierInternal,
  getIdentifier
} from '../MinifiedIdentifier.ts';

describe('MinifiedIdentifier', () => {
  describe(getIdentifierInternal.name, () => {
    it('Round trips identifiers', () => {
      for (let i: number = 0; i < 100000; i++) {
        const actual: number = getOrdinalFromIdentifierInternal(getIdentifierInternal(i));
        if (actual !== i) {
          throw new Error(`Expected ${i} but received ${actual}`);
        }
      }
    });
  });

  describe(getIdentifier.name, () => {
    it('Skips keywords', () => {
      let maxOrdinal: number = 0;
      const shortKeywords: Set<string> = new Set(['do', 'if', 'in']);
      for (const keyword of shortKeywords) {
        const ordinal: number = getOrdinalFromIdentifierInternal(keyword);
        if (ordinal > maxOrdinal) {
          maxOrdinal = ordinal;
        }
        const actual: string = getIdentifier(ordinal);
        if (actual === keyword) {
          throw new Error(`Expected keyword ${keyword} to fail to round trip`);
        }
      }

      for (let i: number = 0; i <= maxOrdinal; i++) {
        const identifier: string = getIdentifier(i);
        if (shortKeywords.has(identifier)) {
          throw new Error(`Expected keyword ${identifier} to be skipped`);
        }
      }
    });
  });
});
