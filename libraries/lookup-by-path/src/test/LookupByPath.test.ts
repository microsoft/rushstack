// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { LookupByPath } from '../LookupByPath';
import type { ILookupByPathJson } from '../LookupByPath';

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

describe('toJson and fromJson', () => {
  it('round-trips an empty trie', () => {
    const original = new LookupByPath<number>();
    const json: ILookupByPathJson<number> = original.toJson((v) => v);
    const restored: LookupByPath<number> = LookupByPath.fromJson(json, (v) => v);

    expect(restored.size).toEqual(0);
    expect([...restored]).toEqual([]);
  });

  it('round-trips with number values', () => {
    const original = new LookupByPath<number>([
      ['foo', 1],
      ['foo/bar', 2],
      ['baz', 3]
    ]);

    const json: ILookupByPathJson<number> = original.toJson((v) => v);
    const restored: LookupByPath<number> = LookupByPath.fromJson(json, (v) => v);

    expect(restored.size).toEqual(3);
    expect(restored.get('foo')).toEqual(1);
    expect(restored.get('foo/bar')).toEqual(2);
    expect(restored.get('baz')).toEqual(3);
    expect(restored.get('missing')).toEqual(undefined);
  });

  it('round-trips with string values', () => {
    const original = new LookupByPath<string>([
      ['a', 'alpha'],
      ['a/b', 'bravo'],
      ['c', 'charlie']
    ]);

    const json: ILookupByPathJson<string> = original.toJson((v) => v);
    const restored: LookupByPath<string> = LookupByPath.fromJson(json, (v) => v);

    expect(restored.size).toEqual(3);
    expect(restored.get('a')).toEqual('alpha');
    expect(restored.get('a/b')).toEqual('bravo');
    expect(restored.get('c')).toEqual('charlie');
  });

  it('preserves reference equality for shared values', () => {
    const sharedObj = { name: 'shared' };
    const original = new LookupByPath<{ name: string }>([
      ['foo', sharedObj],
      ['bar', sharedObj],
      ['baz/qux', sharedObj]
    ]);

    const json: ILookupByPathJson<{ name: string }> = original.toJson((v) => ({ ...v }));
    // All three entries should point at the same index
    expect(json.values.length).toEqual(1);
    expect(json.values[0]).toEqual({ name: 'shared' });

    const restored: LookupByPath<{ name: string }> = LookupByPath.fromJson(json, (v) => ({ ...v }));

    expect(restored.size).toEqual(3);
    const fooVal = restored.get('foo');
    const barVal = restored.get('bar');
    const bazQuxVal = restored.get('baz/qux');

    // All deserialized values should be the same reference
    expect(fooVal).toBe(barVal);
    expect(barVal).toBe(bazQuxVal);
    expect(fooVal).toEqual({ name: 'shared' });
  });

  it('keeps non-reference-equal objects with same JSON as separate entries', () => {
    const obj1 = { name: 'same' };
    const obj2 = { name: 'same' };
    // Verify they are not reference-equal
    expect(obj1).not.toBe(obj2);

    const original = new LookupByPath<{ name: string }>([
      ['foo', obj1],
      ['bar', obj2]
    ]);

    const json: ILookupByPathJson<{ name: string }> = original.toJson((v) => ({ ...v }));
    // Should have two separate entries even though the JSON is the same
    expect(json.values.length).toEqual(2);

    const restored: LookupByPath<{ name: string }> = LookupByPath.fromJson(json, (v) => ({ ...v }));

    expect(restored.size).toEqual(2);
    const fooVal = restored.get('foo');
    const barVal = restored.get('bar');

    // Values should be structurally equal
    expect(fooVal).toEqual({ name: 'same' });
    expect(barVal).toEqual({ name: 'same' });

    // But NOT reference-equal
    expect(fooVal).not.toBe(barVal);
  });

  it('round-trips a complex multi-level tree', () => {
    const original = new LookupByPath<number>([
      ['foo', 1],
      ['foo/bar', 2],
      ['foo/bar/baz', 3],
      ['foo/bar/baz/qux', 4],
      ['bar', 5],
      ['bar/baz', 6]
    ]);

    const json: ILookupByPathJson<number> = original.toJson((v) => v);
    const restored: LookupByPath<number> = LookupByPath.fromJson(json, (v) => v);

    expect(restored.size).toEqual(original.size);
    for (const [path, value] of original) {
      expect(restored.get(path)).toEqual(value);
    }
  });

  it('round-trips with a custom delimiter', () => {
    const original = new LookupByPath<number>(
      [
        ['foo,bar', 1],
        ['foo,bar,baz', 2],
        ['qux', 3]
      ],
      ','
    );

    const json: ILookupByPathJson<number> = original.toJson((v) => v);
    expect(json.delimiter).toEqual(',');

    const restored: LookupByPath<number> = LookupByPath.fromJson(json, (v) => v);

    expect(restored.delimiter).toEqual(',');
    expect(restored.size).toEqual(3);
    expect(restored.get('foo,bar')).toEqual(1);
    expect(restored.get('foo,bar,baz')).toEqual(2);
    expect(restored.get('qux')).toEqual(3);
  });

  it('uses custom serializer and deserializer', () => {
    const original = new LookupByPath<{ id: number; label: string }>([
      ['a', { id: 1, label: 'one' }],
      ['b', { id: 2, label: 'two' }]
    ]);

    const json: ILookupByPathJson<string> = original.toJson((v) => JSON.stringify(v));
    expect(json.values).toEqual(['{"id":1,"label":"one"}', '{"id":2,"label":"two"}']);

    const restored: LookupByPath<{ id: number; label: string }> = LookupByPath.fromJson(
      json,
      (v) => JSON.parse(v) as { id: number; label: string }
    );

    expect(restored.size).toEqual(2);
    expect(restored.get('a')).toEqual({ id: 1, label: 'one' });
    expect(restored.get('b')).toEqual({ id: 2, label: 'two' });
  });

  it('produces valid JSON for the serialized form', () => {
    const original = new LookupByPath<number>([
      ['foo', 1],
      ['foo/bar', 2]
    ]);

    const json: ILookupByPathJson<number> = original.toJson((v) => v);
    const jsonString: string = JSON.stringify(json);
    const parsed: ILookupByPathJson<number> = JSON.parse(jsonString) as ILookupByPathJson<number>;

    const restored: LookupByPath<number> = LookupByPath.fromJson(parsed, (v) => v);
    expect(restored.size).toEqual(2);
    expect(restored.get('foo')).toEqual(1);
    expect(restored.get('foo/bar')).toEqual(2);
  });

  it('preserves findChildPath behavior after round-trip', () => {
    const original = new LookupByPath<number>([
      ['foo', 1],
      ['foo/bar', 2],
      ['baz', 3]
    ]);

    const json: ILookupByPathJson<number> = original.toJson((v) => v);
    const restored: LookupByPath<number> = LookupByPath.fromJson(json, (v) => v);

    expect(restored.findChildPath('foo/baz')).toEqual(1);
    expect(restored.findChildPath('foo/bar/baz')).toEqual(2);
    expect(restored.findChildPath('baz/anything')).toEqual(3);
    expect(restored.findChildPath('missing')).toEqual(undefined);
  });

  it('handles nodes with children but no value', () => {
    const original = new LookupByPath<number>([
      ['foo/bar/baz', 1],
      ['foo/bar/qux', 2]
    ]);

    const json: ILookupByPathJson<number> = original.toJson((v) => v);
    // The intermediate nodes 'foo' and 'foo/bar' should exist in the tree but have no valueIndex
    const fooNode = json.tree.children!.foo;
    const barNode = fooNode.children!.bar;
    expect(fooNode.valueIndex).toBeUndefined();
    expect(barNode.valueIndex).toBeUndefined();
    expect(barNode.children!.baz.valueIndex).toEqual(0);
    expect(barNode.children!.qux.valueIndex).toEqual(1);

    const restored: LookupByPath<number> = LookupByPath.fromJson(json, (v) => v);
    expect(restored.size).toEqual(2);
    expect(restored.get('foo')).toEqual(undefined);
    expect(restored.get('foo/bar')).toEqual(undefined);
    expect(restored.get('foo/bar/baz')).toEqual(1);
    expect(restored.get('foo/bar/qux')).toEqual(2);
  });
});
