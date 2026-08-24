// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { coerceParallelism, parseParallelism } from '../ParseParallelism';

describe(parseParallelism.name, () => {
  it('throwsErrorOnInvalidParallelism', () => {
    expect(() => parseParallelism('tequila')).toThrowErrorMatchingSnapshot();
  });

  it('throwsErrorOnInvalidParallelismPercentage', () => {
    expect(() => parseParallelism('200%')).toThrowErrorMatchingSnapshot();
  });

  it('returns scalar 1 for "max"', () => {
    expect(parseParallelism('max')).toEqual({ scalar: 1 });
  });

  it('returns a scalar for a percentage input', () => {
    expect(parseParallelism('50%')).toEqual({ scalar: 0.5 });
  });

  it('returns a raw number for a numeric input', () => {
    expect(parseParallelism('4')).toBe(4);
  });

  it('trims whitespace from input', () => {
    expect(parseParallelism('  4  ')).toBe(4);
  });
});

describe(coerceParallelism.name, () => {
  describe('raw numeric values', () => {
    it('passes through a number within range', () => {
      expect(coerceParallelism(4, 8)).toBe(4);
    });

    it('clamps a number above maxParallelism down to maxParallelism', () => {
      expect(coerceParallelism(16, 8)).toBe(8);
    });

    it('clamps a negative number up to 0', () => {
      expect(coerceParallelism(-1, 8)).toBe(0);
    });

    it('allows 0', () => {
      expect(coerceParallelism(0, 8)).toBe(0);
    });
  });

  describe('scalar values', () => {
    it('converts scalar 1 to maxParallelism', () => {
      expect(coerceParallelism({ scalar: 1 }, 8)).toBe(8);
    });

    it('converts scalar 0.5 to half of maxParallelism', () => {
      expect(coerceParallelism({ scalar: 0.5 }, 8)).toBe(4);
    });

    it('floors fractional results', () => {
      // floor(0.333333 * 8) = floor(2.666...) = 2
      expect(coerceParallelism({ scalar: 0.333333 }, 8)).toBe(2);
    });

    it('clamps scalar result to at least 1', () => {
      // floor(0.001 * 8) = 0, clamped up to 1
      expect(coerceParallelism({ scalar: 0.001 }, 8)).toBe(1);
    });

    it('Windows default scalar (0.999) yields one less than maxParallelism', () => {
      // floor(0.999 * 8) = floor(7.992) = 7
      expect(coerceParallelism({ scalar: 0.999 }, 8)).toBe(7);
    });
  });
});
