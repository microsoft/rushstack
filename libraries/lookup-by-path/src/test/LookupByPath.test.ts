// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { LookupByPath } from '../LookupByPath';

describe(LookupByPath.iteratePathSegments.name, () => {
  it('returns empty for an empty string', () => {
    const result = [...LookupByPath.iteratePathSegments('')];
    expect(result.length).toEqual(0);
  });
  it('returns the only segment of a trival string', () => {
    const result = [...LookupByPath.iteratePathSegments('foo')];
    expect(result).toEqual(['foo']);
  });
  it('treats backslashes as ordinary characters, per POSIX', () => {
    const result = [...LookupByPath.iteratePathSegments('foo\\bar\\baz')];
    expect(result).toEqual(['foo\\bar\\baz']);
  });
  it('iterates segments', () => {
    const result = [...LookupByPath.iteratePathSegments('foo/bar/baz')];
    expect(result).toEqual(['foo', 'bar', 'baz']);
  });
  it('returns correct last single character segment', () => {
    const result = [...LookupByPath.iteratePathSegments('foo/a')];
    expect(result).toEqual(['foo', 'a']);
  });
});

describe(LookupByPath.prototype.findChildPath.name, () => {
  it('returns empty for an empty tree', () => {
    expect(new LookupByPath().findChildPath('foo')).toEqual(undefined);
  });
  it('returns the matching node for a trivial tree', () => {
    expect(new LookupByPath([['foo', 1]]).findChildPath('foo')).toEqual(1);
  });
  it('returns the matching node for a single-layer tree', () => {
    const tree: LookupByPath<number> = new LookupByPath([
      ['foo', 1],
      ['bar', 2],
      ['baz', 3]
    ]);

    expect(tree.findChildPath('foo')).toEqual(1);
    expect(tree.findChildPath('bar')).toEqual(2);
    expect(tree.findChildPath('baz')).toEqual(3);
    expect(tree.findChildPath('buzz')).toEqual(undefined);
  });
  it('returns the matching parent for multi-layer queries', () => {
    const tree: LookupByPath<number> = new LookupByPath([
      ['foo', 1],
      ['bar', 2],
      ['baz', 3]
    ]);

    expect(tree.findChildPath('foo/bar')).toEqual(1);
    expect(tree.findChildPath('bar/baz')).toEqual(2);
    expect(tree.findChildPath('baz/foo')).toEqual(3);
    expect(tree.findChildPath('foo/foo')).toEqual(1);
  });
  it('returns the matching parent for multi-layer queries in multi-layer trees', () => {
    const tree: LookupByPath<number> = new LookupByPath([
      ['foo', 1],
      ['bar', 2],
      ['baz', 3],
      ['foo/bar', 4],
      ['foo/bar/baz', 5],
      ['baz/foo', 6],
      ['baz/baz/baz/baz', 7]
    ]);

    expect(tree.findChildPath('foo/foo')).toEqual(1);
    expect(tree.findChildPath('foo/bar\\baz')).toEqual(1);

    expect(tree.findChildPath('bar/baz')).toEqual(2);

    expect(tree.findChildPath('baz/bar')).toEqual(3);
    expect(tree.findChildPath('baz/baz')).toEqual(3);
    expect(tree.findChildPath('baz/baz/baz')).toEqual(3);

    expect(tree.findChildPath('foo/bar')).toEqual(4);
    expect(tree.findChildPath('foo/bar/foo')).toEqual(4);

    expect(tree.findChildPath('foo/bar/baz')).toEqual(5);
    expect(tree.findChildPath('foo/bar/baz/baz/baz/baz/baz')).toEqual(5);

    expect(tree.findChildPath('baz/foo/')).toEqual(6);

    expect(tree.findChildPath('baz/baz/baz/baz')).toEqual(7);

    expect(tree.findChildPath('')).toEqual(undefined);
    expect(tree.findChildPath('foofoo')).toEqual(undefined);
    expect(tree.findChildPath('foo\\bar\\baz')).toEqual(undefined);
  });
  it('handles custom delimiters', () => {
    const tree: LookupByPath<number> = new LookupByPath(
      [
        ['foo,bar', 1],
        ['foo/bar', 2]
      ],
      ','
    );

    expect(tree.findChildPath('foo/bar,baz')).toEqual(2);
    expect(tree.findChildPath('foo,bar/baz')).toEqual(undefined);
    expect(tree.findChildPathFromSegments(['foo', 'bar', 'baz'])).toEqual(1);
  });
});

describe(LookupByPath.prototype.findLongestPrefixMatch.name, () => {
  it('returns empty for an empty tree', () => {
    expect(new LookupByPath().findLongestPrefixMatch('foo')).toEqual(undefined);
  });
  it('returns the matching node for a trivial tree', () => {
    expect(new LookupByPath([['foo', 1]]).findLongestPrefixMatch('foo')).toEqual({ value: 1, index: 3 });
  });
  it('returns the matching node for a single-layer tree', () => {
    const tree: LookupByPath<number> = new LookupByPath([
      ['foo', 1],
      ['barbar', 2],
      ['baz', 3]
    ]);

    expect(tree.findLongestPrefixMatch('foo')).toEqual({ value: 1, index: 3 });
    expect(tree.findLongestPrefixMatch('barbar')).toEqual({ value: 2, index: 6 });
    expect(tree.findLongestPrefixMatch('baz')).toEqual({ value: 3, index: 3 });
    expect(tree.findLongestPrefixMatch('buzz')).toEqual(undefined);
  });
  it('returns the matching parent for multi-layer queries', () => {
    const tree: LookupByPath<number> = new LookupByPath([
      ['foo', 1],
      ['barbar', 2],
      ['baz', 3],
      ['foo/bar', 4]
    ]);

    expect(tree.findLongestPrefixMatch('foo/bar')).toEqual({
      value: 4,
      index: 7,
      lastMatch: { value: 1, index: 3 }
    });
    expect(tree.findLongestPrefixMatch('barbar/baz')).toEqual({ value: 2, index: 6 });
    expect(tree.findLongestPrefixMatch('baz/foo')).toEqual({ value: 3, index: 3 });
    expect(tree.findLongestPrefixMatch('foo/foo')).toEqual({ value: 1, index: 3 });
  });
});

describe(LookupByPath.prototype.groupByChild.name, () => {
  const lookup: LookupByPath<string> = new LookupByPath([
    ['foo', 'foo'],
    ['foo/bar', 'bar'],
    ['foo/bar/baz', 'baz']
  ]);

  it('returns empty map for empty input', () => {
    expect(lookup.groupByChild(new Map())).toEqual(new Map());
  });

  it('groups items by the closest group that contains the file path', () => {
    const infoByPath: Map<string, string> = new Map([
      ['foo', 'foo'],
      ['foo/bar', 'bar'],
      ['foo/bar/baz', 'baz'],
      ['foo/bar/baz/qux', 'qux'],
      ['foo/bar/baz/qux/quux', 'quux']
    ]);

    const expected: Map<string, Map<string, string>> = new Map([
      ['foo', new Map([['foo', 'foo']])],
      ['bar', new Map([['foo/bar', 'bar']])],
      [
        'baz',
        new Map([
          ['foo/bar/baz', 'baz'],
          ['foo/bar/baz/qux', 'qux'],
          ['foo/bar/baz/qux/quux', 'quux']
        ])
      ]
    ]);

    expect(lookup.groupByChild(infoByPath)).toEqual(expected);
  });

  it('ignores items that do not exist in the lookup', () => {
    const infoByPath: Map<string, string> = new Map([
      ['foo', 'foo'],
      ['foo/qux', 'qux'],
      ['bar', 'bar'],
      ['baz', 'baz']
    ]);

    const expected: Map<string, Map<string, string>> = new Map([
      [
        'foo',
        new Map([
          ['foo', 'foo'],
          ['foo/qux', 'qux']
        ])
      ]
    ]);

    expect(lookup.groupByChild(infoByPath)).toEqual(expected);
  });

  it('ignores items that do not exist in the lookup when the lookup children are possibly falsy', () => {
    const falsyLookup: LookupByPath<string> = new LookupByPath([
      ['foo', 'foo'],
      ['foo/bar', 'bar'],
      ['foo/bar/baz', '']
    ]);

    const infoByPath: Map<string, string> = new Map([
      ['foo', 'foo'],
      ['foo/bar', 'bar'],
      ['foo/bar/baz', 'baz'],
      ['foo/bar/baz/qux', 'qux'],
      ['foo/bar/baz/qux/quux', 'quux']
    ]);

    const expected: Map<string, Map<string, string>> = new Map([
      ['foo', new Map([['foo', 'foo']])],
      ['bar', new Map([['foo/bar', 'bar']])],
      [
        '',
        new Map([
          ['foo/bar/baz', 'baz'],
          ['foo/bar/baz/qux', 'qux'],
          ['foo/bar/baz/qux/quux', 'quux']
        ])
      ]
    ]);

    expect(falsyLookup.groupByChild(infoByPath)).toEqual(expected);
  });
});
