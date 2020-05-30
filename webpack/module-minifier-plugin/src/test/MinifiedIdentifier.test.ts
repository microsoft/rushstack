import { getIdentifierInternal, getOrdinalFromIdentifierInternal, getIdentifier } from '../MinifiedIdentifier';

describe('MinifiedIdentifier', () => {
  describe('getIdentifierInternal', () => {
    it('Round trips identifiers', () => {
      for (let i: number = 0; i < 100000; i++) {
        const actual: number = getOrdinalFromIdentifierInternal(getIdentifierInternal(i));
        if (actual !== i) {
          throw new Error(`Expected ${i} but received ${actual}`);
        }
      }
    });
  });

  describe('getIdentifier', () => {
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