// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { getFirstDifferenceInCommonNodes } from '../getFirstDifferenceInCommonNodes.ts';
import type { IReadonlyPathTrieNode } from '../LookupByPath.ts';

describe(getFirstDifferenceInCommonNodes.name, () => {
  it('detects a changed file at the current node', () => {
    const last: IReadonlyPathTrieNode<string> = {
      children: undefined,
      value: 'old'
    };
    const current: IReadonlyPathTrieNode<string> = {
      children: undefined,
      value: 'new'
    };

    expect(
      getFirstDifferenceInCommonNodes({
        first: last,
        second: current
      })
    ).toBe('');
    expect(
      getFirstDifferenceInCommonNodes({
        first: current,
        second: last
      })
    ).toBe('');

    const prefix: string = 'some/prefix';

    expect(
      getFirstDifferenceInCommonNodes({
        first: last,
        second: current,
        prefix
      })
    ).toBe(prefix);
    expect(
      getFirstDifferenceInCommonNodes({
        first: current,
        second: last,
        prefix
      })
    ).toBe(prefix);
  });

  it('detects no changes when both nodes are identical', () => {
    const last: IReadonlyPathTrieNode<string> = {
      children: new Map([
        [
          'same',
          {
            children: undefined,
            value: 'same'
          }
        ]
      ]),
      value: undefined
    };
    const current: IReadonlyPathTrieNode<string> = {
      children: new Map([
        [
          'same',
          {
            children: undefined,
            value: 'same'
          }
        ]
      ]),
      value: undefined
    };

    expect(
      getFirstDifferenceInCommonNodes({
        first: last,
        second: current
      })
    ).toBeUndefined();
    expect(
      getFirstDifferenceInCommonNodes({
        first: current,
        second: last
      })
    ).toBeUndefined();
  });

  it('detects no changes when both nodes are identical based on a custom equals', () => {
    const last: IReadonlyPathTrieNode<string> = {
      children: new Map([
        [
          'same',
          {
            children: undefined,
            value: 'same'
          }
        ]
      ]),
      value: undefined
    };
    const current: IReadonlyPathTrieNode<string> = {
      children: new Map([
        [
          'same',
          {
            children: undefined,
            value: 'other'
          }
        ]
      ]),
      value: undefined
    };

    function customEquals(a: string, b: string): boolean {
      return a === b || (a === 'same' && b === 'other') || (a === 'other' && b === 'same');
    }

    expect(
      getFirstDifferenceInCommonNodes({
        first: last,
        second: current,
        equals: customEquals
      })
    ).toBeUndefined();
    expect(
      getFirstDifferenceInCommonNodes({
        first: current,
        second: last,
        equals: customEquals
      })
    ).toBeUndefined();
  });

  it('detects no changes for extra children', () => {
    const last: IReadonlyPathTrieNode<string> = {
      children: undefined,
      value: undefined
    };
    const current: IReadonlyPathTrieNode<string> = {
      children: new Map([
        [
          'same',
          {
            children: undefined,
            value: 'same'
          }
        ]
      ]),
      value: undefined
    };

    expect(
      getFirstDifferenceInCommonNodes({
        first: last,
        second: current
      })
    ).toBeUndefined();
    expect(
      getFirstDifferenceInCommonNodes({
        first: current,
        second: last
      })
    ).toBeUndefined();
  });

  it('detects no changes if the set of common nodes differs', () => {
    const last: IReadonlyPathTrieNode<string> = {
      children: undefined,
      value: undefined
    };
    const current: IReadonlyPathTrieNode<string> = {
      children: undefined,
      value: 'new'
    };

    expect(
      getFirstDifferenceInCommonNodes({
        first: last,
        second: current
      })
    ).toBeUndefined();
    expect(
      getFirstDifferenceInCommonNodes({
        first: current,
        second: last
      })
    ).toBeUndefined();
  });

  it('detects a nested change', () => {
    const last: IReadonlyPathTrieNode<string> = {
      children: new Map([
        [
          'child',
          {
            children: undefined,
            value: 'old'
          }
        ]
      ]),
      value: undefined
    };
    const current: IReadonlyPathTrieNode<string> = {
      children: new Map([
        [
          'child',
          {
            children: undefined,
            value: 'new'
          }
        ]
      ]),
      value: undefined
    };

    const prefix: string = 'some/prefix';

    expect(
      getFirstDifferenceInCommonNodes({
        first: last,
        second: current,
        prefix,
        delimiter: '@'
      })
    ).toBe('some/prefix@child');
    expect(
      getFirstDifferenceInCommonNodes({
        first: current,
        second: last,
        prefix,
        delimiter: '@'
      })
    ).toBe('some/prefix@child');
  });
});
