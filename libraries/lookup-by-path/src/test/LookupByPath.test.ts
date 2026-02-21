// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { LookupByPath } from '../LookupByPath.ts';

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

describe('size', () => {
  it('returns 0 for an empty tree', () => {
    expect(new LookupByPath().size).toEqual(0);
  });

  it('returns the number of nodes for a non-empty tree', () => {
    const lookup: LookupByPath<number> = new LookupByPath([['foo', 1]]);
    expect(lookup.size).toEqual(1);
    lookup.setItem('bar', 2);
    expect(lookup.size).toEqual(2);
    lookup.setItem('bar', 4);
    expect(lookup.size).toEqual(2);
    lookup.setItem('bar/baz', 1);
    expect(lookup.size).toEqual(3);
    lookup.setItem('foo/bar/qux/quux', 1);
    expect(lookup.size).toEqual(4);
  });
});

describe(LookupByPath.prototype.get.name, () => {
  it('returns undefined for an empty tree', () => {
    expect(new LookupByPath().get('foo')).toEqual(undefined);
  });

  it('returns the matching node for a trivial tree', () => {
    expect(new LookupByPath([['foo', 1]]).get('foo')).toEqual(1);
  });

  it('returns undefined for non-matching paths in a single-layer tree', () => {
    const tree: LookupByPath<number> = new LookupByPath([
      ['foo', 1],
      ['bar', 2],
      ['baz', 3]
    ]);

    expect(tree.get('buzz')).toEqual(undefined);
    expect(tree.get('foo/bar')).toEqual(undefined);
  });

  it('returns the matching node for a multi-layer tree', () => {
    const tree: LookupByPath<number> = new LookupByPath([
      ['foo', 1],
      ['foo/bar', 2],
      ['foo/bar/baz', 3]
    ]);

    expect(tree.get('foo')).toEqual(1);
    expect(tree.get('foo/bar')).toEqual(2);
    expect(tree.get('foo/bar/baz')).toEqual(3);

    expect(tree.get('foo')).toEqual(1);
    expect(tree.get('foo,bar', ',')).toEqual(2);
    expect(tree.get('foo\0bar\0baz', '\0')).toEqual(3);
  });

  it('returns undefined for non-matching paths in a multi-layer tree', () => {
    const tree: LookupByPath<number> = new LookupByPath([
      ['foo', 1],
      ['foo/bar', 2],
      ['foo/bar/baz', 3]
    ]);

    expect(tree.get('foo/baz')).toEqual(undefined);
    expect(tree.get('foo/bar/baz/qux')).toEqual(undefined);
  });
});

describe(LookupByPath.prototype.has.name, () => {
  it('returns false for an empty tree', () => {
    expect(new LookupByPath().has('foo')).toEqual(false);
  });

  it('returns true for the matching node in a trivial tree', () => {
    expect(new LookupByPath([['foo', 1]]).has('foo')).toEqual(true);
  });

  it('returns false for non-matching paths in a single-layer tree', () => {
    const tree: LookupByPath<number> = new LookupByPath([
      ['foo', 1],
      ['bar', 2],
      ['baz', 3]
    ]);

    expect(tree.has('buzz')).toEqual(false);
    expect(tree.has('foo/bar')).toEqual(false);
  });

  it('returns true for the matching node in a multi-layer tree', () => {
    const tree: LookupByPath<number> = new LookupByPath([
      ['foo', 1],
      ['foo/bar', 2],
      ['foo/bar/baz', 3]
    ]);

    expect(tree.has('foo')).toEqual(true);
    expect(tree.has('foo/bar')).toEqual(true);
    expect(tree.has('foo/bar/baz')).toEqual(true);

    expect(tree.has('foo')).toEqual(true);
    expect(tree.has('foo,bar', ',')).toEqual(true);
    expect(tree.has('foo\0bar\0baz', '\0')).toEqual(true);
  });

  it('returns false for non-matching paths in a multi-layer tree', () => {
    const tree: LookupByPath<number> = new LookupByPath([
      ['foo', 1],
      ['foo/bar', 2],
      ['foo/bar/baz', 3]
    ]);

    expect(tree.has('foo/baz')).toEqual(false);
    expect(tree.has('foo/bar/baz/qux')).toEqual(false);
  });
});

describe(LookupByPath.prototype.clear.name, () => {
  it('clears an empty tree', () => {
    const tree = new LookupByPath();
    tree.clear();
    expect(tree.size).toEqual(0);
  });

  it('clears a single-layer tree', () => {
    const tree = new LookupByPath([['foo', 1]]);
    expect(tree.size).toEqual(1);
    tree.clear();
    expect(tree.size).toEqual(0);
  });

  it('clears a multi-layer tree', () => {
    const tree = new LookupByPath([
      ['foo', 1],
      ['foo/bar', 2],
      ['foo/bar/baz', 3]
    ]);
    expect(tree.size).toEqual(3);
    tree.clear();
    expect(tree.size).toEqual(0);
  });

  it('clears a tree with custom delimiters', () => {
    const tree = new LookupByPath(
      [
        ['foo,bar', 1],
        ['foo,bar,baz', 2]
      ],
      ','
    );
    expect(tree.size).toEqual(2);
    tree.clear();
    expect(tree.size).toEqual(0);
  });
});

describe(LookupByPath.prototype.entries.name, () => {
  it('returns an empty iterator for an empty tree', () => {
    const tree = new LookupByPath();
    const result = [...tree];
    expect(result).toEqual([]);
  });

  it('returns an iterator for a single-layer tree', () => {
    const tree: LookupByPath<number> = new LookupByPath([
      ['foo', 1],
      ['bar', 2],
      ['baz', 3]
    ]);

    const result = [...tree];
    expect(result.length).toEqual(tree.size);
    expect(Object.fromEntries(result)).toEqual({
      foo: 1,
      bar: 2,
      baz: 3
    });
  });

  it('returns an iterator for a multi-layer tree', () => {
    const tree: LookupByPath<number> = new LookupByPath([
      ['foo', 1],
      ['foo/bar', 2],
      ['foo/bar/baz', 3]
    ]);

    const result = [...tree];
    expect(result.length).toEqual(tree.size);
    expect(Object.fromEntries(result)).toEqual({
      foo: 1,
      'foo/bar': 2,
      'foo/bar/baz': 3
    });
  });

  it('only includes non-empty nodes', () => {
    const tree: LookupByPath<number> = new LookupByPath([
      ['foo/bar/baz', 1],
      ['foo/bar/baz/qux/quux', 2]
    ]);

    const result = [...tree];
    expect(result.length).toEqual(tree.size);
    expect(Object.fromEntries(result)).toEqual({
      'foo/bar/baz': 1,
      'foo/bar/baz/qux/quux': 2
    });
  });

  it('returns an iterator for a tree with custom delimiters', () => {
    const tree: LookupByPath<number> = new LookupByPath(
      [
        ['foo,bar', 1],
        ['foo,bar,baz', 2]
      ],
      ','
    );

    const result = [...tree];
    expect(result.length).toEqual(tree.size);
    expect(Object.fromEntries(result)).toEqual({
      'foo,bar': 1,
      'foo,bar,baz': 2
    });
  });

  it('returns an iterator for a subtree', () => {
    const tree: LookupByPath<number> = new LookupByPath([
      ['foo', 1],
      ['foo/bar', 2],
      ['foo/bar/baz', 3],
      ['bar', 4],
      ['bar/baz', 5]
    ]);

    const result = [...tree.entries('foo')];
    expect(result.length).toEqual(3);
    expect(Object.fromEntries(result)).toEqual({
      foo: 1,
      'foo/bar': 2,
      'foo/bar/baz': 3
    });
  });

  it('returns an iterator for a subtree with custom delimiters', () => {
    const tree: LookupByPath<number> = new LookupByPath([
      ['foo/bar', 1],
      ['foo/bar/baz', 2],
      ['bar/baz', 3]
    ]);

    const result = [...tree.entries('foo', ',')];
    expect(result.length).toEqual(2);
    expect(Object.fromEntries(result)).toEqual({
      'foo,bar': 1,
      'foo,bar,baz': 2
    });
  });
});

describe(LookupByPath.prototype.deleteItem.name, () => {
  it('returns false for an empty tree', () => {
    expect(new LookupByPath().deleteItem('foo')).toEqual(false);
  });

  it('deletes the matching node in a trivial tree', () => {
    const tree = new LookupByPath([['foo', 1]]);
    expect(tree.deleteItem('foo')).toEqual(true);
    expect(tree.size).toEqual(0);
    expect(tree.get('foo')).toEqual(undefined);
  });

  it('returns false for non-matching paths in a single-layer tree', () => {
    const tree: LookupByPath<number> = new LookupByPath([
      ['foo', 1],
      ['bar', 2],
      ['baz', 3]
    ]);

    expect(tree.deleteItem('buzz')).toEqual(false);
    expect(tree.size).toEqual(3);
  });

  it('deletes the matching node in a single-layer tree', () => {
    const tree: LookupByPath<number> = new LookupByPath([
      ['foo', 1],
      ['bar', 2],
      ['baz', 3]
    ]);

    expect(tree.deleteItem('bar')).toEqual(true);
    expect(tree.size).toEqual(2);
    expect(tree.get('bar')).toEqual(undefined);
  });

  it('deletes the matching node in a multi-layer tree', () => {
    const tree: LookupByPath<number> = new LookupByPath([
      ['foo', 1],
      ['foo/bar', 2],
      ['foo/bar/baz', 3]
    ]);

    expect(tree.deleteItem('foo/bar')).toEqual(true);
    expect(tree.size).toEqual(2);
    expect(tree.get('foo/bar')).toEqual(undefined);
    expect(tree.get('foo/bar/baz')).toEqual(3); // child nodes are retained
  });

  it('returns false for non-matching paths in a multi-layer tree', () => {
    const tree: LookupByPath<number> = new LookupByPath([
      ['foo', 1],
      ['foo/bar', 2],
      ['foo/bar/baz', 3]
    ]);

    expect(tree.deleteItem('foo/baz')).toEqual(false);
    expect(tree.size).toEqual(3);
  });

  it('handles custom delimiters', () => {
    const tree: LookupByPath<number> = new LookupByPath(
      [
        ['foo,bar', 1],
        ['foo,bar,baz', 2]
      ],
      ','
    );

    expect(tree.deleteItem('foo\0bar', '\0')).toEqual(true);
    expect(tree.size).toEqual(1);
    expect(tree.get('foo\0bar', '\0')).toEqual(undefined);
    expect(tree.get('foo\0bar\0baz', '\0')).toEqual(2); // child nodes are retained
  });
});

describe(LookupByPath.prototype.deleteSubtree.name, () => {
  it('returns false for an empty tree', () => {
    expect(new LookupByPath().deleteSubtree('foo')).toEqual(false);
  });

  it('deletes the matching node in a trivial tree', () => {
    const tree = new LookupByPath([['foo', 1]]);
    expect(tree.deleteSubtree('foo')).toEqual(true);
    expect(tree.size).toEqual(0);
    expect(tree.get('foo')).toEqual(undefined);
  });

  it('returns false for non-matching paths in a single-layer tree', () => {
    const tree: LookupByPath<number> = new LookupByPath([
      ['foo', 1],
      ['bar', 2],
      ['baz', 3]
    ]);

    expect(tree.deleteSubtree('buzz')).toEqual(false);
    expect(tree.size).toEqual(3);
  });

  it('deletes the matching node in a single-layer tree', () => {
    const tree: LookupByPath<number> = new LookupByPath([
      ['foo', 1],
      ['bar', 2],
      ['baz', 3]
    ]);

    expect(tree.deleteSubtree('bar')).toEqual(true);
    expect(tree.size).toEqual(2);
    expect(tree.get('bar')).toEqual(undefined);
  });

  it('deletes the matching subtree in a multi-layer tree', () => {
    const tree: LookupByPath<number> = new LookupByPath([
      ['foo', 1],
      ['foo/bar', 2],
      ['foo/bar/baz', 3]
    ]);

    expect(tree.deleteSubtree('foo/bar')).toEqual(true);
    expect(tree.size).toEqual(1);
    expect(tree.get('foo/bar')).toEqual(undefined);
    expect(tree.get('foo/bar/baz')).toEqual(undefined); // child nodes are deleted
  });

  it('returns false for non-matching paths in a multi-layer tree', () => {
    const tree: LookupByPath<number> = new LookupByPath([
      ['foo', 1],
      ['foo/bar', 2],
      ['foo/bar/baz', 3]
    ]);

    expect(tree.deleteSubtree('foo/baz')).toEqual(false);
    expect(tree.size).toEqual(3);
  });

  it('handles custom delimiters', () => {
    const tree: LookupByPath<number> = new LookupByPath(
      [
        ['foo,bar', 1],
        ['foo,bar,baz', 2]
      ],
      ','
    );

    expect(tree.deleteSubtree('foo\0bar', '\0')).toEqual(true);
    expect(tree.size).toEqual(0);
    expect(tree.get('foo\0bar', '\0')).toEqual(undefined);
    expect(tree.get('foo\0bar\0baz', '\0')).toEqual(undefined); // child nodes are deleted
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
    expect(tree.findChildPath('foo,bar,baz', ',')).toEqual(1);
    expect(tree.findChildPath('foo\0bar\0baz', '\0')).toEqual(1);
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

  it('groups items by the closest group that contains the file path with custom delimiter', () => {
    const customLookup: LookupByPath<string> = new LookupByPath(
      [
        ['foo,bar', 'bar'],
        ['foo,bar,baz', 'baz']
      ],
      ','
    );

    const infoByPath: Map<string, string> = new Map([
      ['foo\0bar', 'bar'],
      ['foo\0bar\0baz', 'baz'],
      ['foo\0bar\0baz\0qux', 'qux'],
      ['foo\0bar\0baz\0qux\0quux', 'quux']
    ]);

    const expected: Map<string, Map<string, string>> = new Map([
      ['bar', new Map([['foo\0bar', 'bar']])],
      [
        'baz',
        new Map([
          ['foo\0bar\0baz', 'baz'],
          ['foo\0bar\0baz\0qux', 'qux'],
          ['foo\0bar\0baz\0qux\0quux', 'quux']
        ])
      ]
    ]);

    expect(customLookup.groupByChild(infoByPath, '\0')).toEqual(expected);
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
