// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  ExcerptTokenKind,
  type IExcerptToken,
  type IExcerptTokenRange
} from '@microsoft/api-extractor-model';

import { condenseTokens } from '../condenseTokens';

function content(text: string): IExcerptToken {
  return { kind: ExcerptTokenKind.Content, text };
}

function reference(text: string, canonicalReference?: string): IExcerptToken {
  return { kind: ExcerptTokenKind.Reference, text, canonicalReference };
}

/**
 * A deliberately naive reference implementation of the token-condensing algorithm, used as an oracle
 * in the randomized test below. It mirrors the original (pre-optimization) behavior: repeatedly
 * splicing merged tokens out of the array and re-deriving the set of protected indices after each
 * merge. It is intentionally O(n^2) and simple so that it is easy to verify by inspection.
 */
function condenseTokensReference(excerptTokens: IExcerptToken[], tokenRanges: IExcerptTokenRange[]): void {
  const startOrEndIndices: Set<number> = new Set();
  for (const tokenRange of tokenRanges) {
    startOrEndIndices.add(tokenRange.startIndex);
    startOrEndIndices.add(tokenRange.endIndex);
  }

  for (let currentIndex: number = 1; currentIndex < excerptTokens.length; ++currentIndex) {
    while (currentIndex < excerptTokens.length) {
      const prevPrevToken: IExcerptToken = excerptTokens[currentIndex - 2];
      const prevToken: IExcerptToken = excerptTokens[currentIndex - 1];
      const currentToken: IExcerptToken = excerptTokens[currentIndex];

      let mergeCount: number;
      if (
        prevPrevToken &&
        prevPrevToken.kind === ExcerptTokenKind.Reference &&
        prevToken.kind === ExcerptTokenKind.Content &&
        prevToken.text.trim() === '.' &&
        currentToken.kind === ExcerptTokenKind.Reference &&
        !startOrEndIndices.has(currentIndex) &&
        !startOrEndIndices.has(currentIndex - 1)
      ) {
        prevPrevToken.text += prevToken.text + currentToken.text;
        prevPrevToken.canonicalReference = currentToken.canonicalReference;
        mergeCount = 2;
        currentIndex--;
      } else if (
        prevToken.kind === ExcerptTokenKind.Content &&
        prevToken.kind === currentToken.kind &&
        !startOrEndIndices.has(currentIndex)
      ) {
        prevToken.text += currentToken.text;
        mergeCount = 1;
      } else {
        break;
      }

      excerptTokens.splice(currentIndex, mergeCount);
      for (const tokenRange of tokenRanges) {
        if (tokenRange.startIndex > currentIndex) {
          tokenRange.startIndex -= mergeCount;
        }
        if (tokenRange.endIndex > currentIndex) {
          tokenRange.endIndex -= mergeCount;
        }
      }

      startOrEndIndices.clear();
      for (const tokenRange of tokenRanges) {
        startOrEndIndices.add(tokenRange.startIndex);
        startOrEndIndices.add(tokenRange.endIndex);
      }
    }
  }
}

describe('condenseTokens', () => {
  it('merges adjacent content tokens', () => {
    const tokens: IExcerptToken[] = [content('export '), content('declare '), content('class')];
    const ranges: IExcerptTokenRange[] = [];

    condenseTokens(tokens, ranges);

    expect(tokens).toEqual([content('export declare class')]);
  });

  it('does not merge content into an adjacent reference token', () => {
    const tokens: IExcerptToken[] = [reference('Foo', 'foo'), content(' bar')];
    const ranges: IExcerptTokenRange[] = [];

    condenseTokens(tokens, ranges);

    expect(tokens).toEqual([reference('Foo', 'foo'), content(' bar')]);
  });

  it('merges a "Reference . Reference" sequence into a single reference token', () => {
    const tokens: IExcerptToken[] = [
      reference('MyNamespace', 'ns'),
      content('.'),
      reference('MyClass', 'cls')
    ];
    const ranges: IExcerptTokenRange[] = [];

    condenseTokens(tokens, ranges);

    // The canonical reference of the last reference token wins.
    expect(tokens).toEqual([reference('MyNamespace.MyClass', 'cls')]);
  });

  it('merges a chain of reference tokens', () => {
    const tokens: IExcerptToken[] = [
      reference('A', 'a'),
      content('.'),
      reference('B', 'b'),
      content('.'),
      reference('C', 'c')
    ];
    const ranges: IExcerptTokenRange[] = [];

    condenseTokens(tokens, ranges);

    expect(tokens).toEqual([reference('A.B.C', 'c')]);
  });

  it('remaps a token range after merging preceding tokens', () => {
    // ["A", "B", "C"] with range [0, 2) should become ["AB", "C"] with range [0, 1).
    const tokens: IExcerptToken[] = [content('A'), content('B'), content('C')];
    const ranges: IExcerptTokenRange[] = [{ startIndex: 0, endIndex: 2 }];

    condenseTokens(tokens, ranges);

    expect(tokens).toEqual([content('AB'), content('C')]);
    expect(ranges).toEqual([{ startIndex: 0, endIndex: 1 }]);
  });

  it('does not merge across a range boundary', () => {
    // With range [0, 1), token "B" is protected as the exclusive end, so "A" and "B" cannot merge.
    const tokens: IExcerptToken[] = [content('A'), content('B'), content('C')];
    const ranges: IExcerptTokenRange[] = [{ startIndex: 0, endIndex: 1 }];

    condenseTokens(tokens, ranges);

    expect(tokens).toEqual([content('A'), content('BC')]);
    expect(ranges).toEqual([{ startIndex: 0, endIndex: 1 }]);
  });

  it('does not merge a reference chain when the "." token is a range boundary', () => {
    const tokens: IExcerptToken[] = [reference('A', 'a'), content('.'), reference('B', 'b')];
    // The "." token (index 1) is the start of a range, so the reference merge must not occur.
    const ranges: IExcerptTokenRange[] = [{ startIndex: 1, endIndex: 3 }];

    condenseTokens(tokens, ranges);

    expect(tokens).toEqual([reference('A', 'a'), content('.'), reference('B', 'b')]);
    expect(ranges).toEqual([{ startIndex: 1, endIndex: 3 }]);
  });

  it('handles a "." token that is itself a merged whitespace + dot content token', () => {
    // The leading whitespace content token and the "." content token merge into " .", which then
    // participates in the reference merge. The surviving "." token originates from the whitespace
    // token's index, which is what protects the range remapping.
    const tokens: IExcerptToken[] = [reference('A', 'a'), content(' '), content('.'), reference('B', 'b')];
    const ranges: IExcerptTokenRange[] = [];

    condenseTokens(tokens, ranges);

    expect(tokens).toEqual([reference('A .B', 'b')]);
  });

  it('remaps an exclusive endIndex equal to the token count', () => {
    const tokens: IExcerptToken[] = [content('a'), content('b'), content('c')];
    const ranges: IExcerptTokenRange[] = [{ startIndex: 0, endIndex: 3 }];

    condenseTokens(tokens, ranges);

    expect(tokens).toEqual([content('abc')]);
    expect(ranges).toEqual([{ startIndex: 0, endIndex: 1 }]);
  });

  it('handles empty input', () => {
    const tokens: IExcerptToken[] = [];
    const ranges: IExcerptTokenRange[] = [{ startIndex: 0, endIndex: 0 }];

    condenseTokens(tokens, ranges);

    expect(tokens).toEqual([]);
    expect(ranges).toEqual([{ startIndex: 0, endIndex: 0 }]);
  });

  it('matches the reference implementation across many randomized inputs', () => {
    let seed: number = 0x1234abcd;
    // A small deterministic PRNG so the test is reproducible.
    const nextRandom = (): number => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return ((seed >>> 0) % 100000) / 100000;
    };

    const makeToken = (index: number): IExcerptToken => {
      const roll: number = nextRandom();
      if (roll < 0.4) {
        return reference('Ref' + index, 'cr' + index);
      }
      if (roll < 0.6) {
        return content('.');
      }
      if (roll < 0.78) {
        return content('  ');
      }
      return content('txt' + index);
    };

    for (let iteration: number = 0; iteration < 5000; ++iteration) {
      const tokenCount: number = Math.floor(nextRandom() * 10);
      const baseTokens: IExcerptToken[] = [];
      for (let i: number = 0; i < tokenCount; ++i) {
        baseTokens.push(makeToken(i));
      }

      const rangeCount: number = Math.floor(nextRandom() * 3);
      const baseRanges: IExcerptTokenRange[] = [];
      for (let r: number = 0; r < rangeCount; ++r) {
        const startIndex: number = Math.floor(nextRandom() * (tokenCount + 1));
        const endIndex: number = Math.min(
          tokenCount,
          startIndex + Math.floor(nextRandom() * (tokenCount + 1))
        );
        baseRanges.push({ startIndex, endIndex });
      }

      const actualTokens: IExcerptToken[] = baseTokens.map((token) => ({ ...token }));
      const actualRanges: IExcerptTokenRange[] = baseRanges.map((range) => ({ ...range }));
      condenseTokens(actualTokens, actualRanges);

      const expectedTokens: IExcerptToken[] = baseTokens.map((token) => ({ ...token }));
      const expectedRanges: IExcerptTokenRange[] = baseRanges.map((range) => ({ ...range }));
      condenseTokensReference(expectedTokens, expectedRanges);

      expect(actualTokens).toEqual(expectedTokens);
      expect(actualRanges).toEqual(expectedRanges);
    }
  });
});
