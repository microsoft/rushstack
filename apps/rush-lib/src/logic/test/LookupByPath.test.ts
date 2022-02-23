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
