import { LookupByPath } from '../LookupByPath';

describe('iteratePathSegments', () => {
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

describe('findNearestAncestor', () => {
  it('returns empty for an empty tree', () => {
    expect(new LookupByPath().findNearestAncestor('foo')).toEqual(undefined);
  });
  it('returns the matching node for a trivial tree', () => {
    expect(new LookupByPath([['foo', 1]]).findNearestAncestor('foo')).toEqual(1);
  });
  it('returns the matching node for a single-layer tree', () => {
    const tree: LookupByPath<number> = new LookupByPath([
      ['foo', 1],
      ['bar', 2],
      ['baz', 3]
    ]);

    expect(tree.findNearestAncestor('foo')).toEqual(1);
    expect(tree.findNearestAncestor('bar')).toEqual(2);
    expect(tree.findNearestAncestor('baz')).toEqual(3);
    expect(tree.findNearestAncestor('buzz')).toEqual(undefined);
  });
  it('returns the matching parent for multi-layer queries', () => {
    const tree: LookupByPath<number> = new LookupByPath([
      ['foo', 1],
      ['bar', 2],
      ['baz', 3]
    ]);

    expect(tree.findNearestAncestor('foo/bar')).toEqual(1);
    expect(tree.findNearestAncestor('bar/baz')).toEqual(2);
    expect(tree.findNearestAncestor('baz/foo')).toEqual(3);
    expect(tree.findNearestAncestor('foo/foo')).toEqual(1);
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

    expect(tree.findNearestAncestor('foo/foo')).toEqual(1);
    expect(tree.findNearestAncestor('foo/bar\\baz')).toEqual(1);

    expect(tree.findNearestAncestor('bar/baz')).toEqual(2);

    expect(tree.findNearestAncestor('baz/bar')).toEqual(3);
    expect(tree.findNearestAncestor('baz/baz')).toEqual(3);
    expect(tree.findNearestAncestor('baz/baz/baz')).toEqual(3);

    expect(tree.findNearestAncestor('foo/bar')).toEqual(4);
    expect(tree.findNearestAncestor('foo/bar/foo')).toEqual(4);

    expect(tree.findNearestAncestor('foo/bar/baz')).toEqual(5);
    expect(tree.findNearestAncestor('foo/bar/baz/baz/baz/baz/baz')).toEqual(5);

    expect(tree.findNearestAncestor('baz/foo/')).toEqual(6);

    expect(tree.findNearestAncestor('baz/baz/baz/baz')).toEqual(7);

    expect(tree.findNearestAncestor('')).toEqual(undefined);
    expect(tree.findNearestAncestor('foofoo')).toEqual(undefined);
    expect(tree.findNearestAncestor('foo\\bar\\baz')).toEqual(undefined);
  });
  it('handles custom delimiters', () => {
    const tree: LookupByPath<number> = new LookupByPath(
      [
        ['foo,bar', 1],
        ['foo/bar', 2]
      ],
      ','
    );

    expect(tree.findNearestAncestor('foo/bar,baz')).toEqual(2);
    expect(tree.findNearestAncestor('foo,bar/baz')).toEqual(undefined);
    expect(tree.findNearestAncestorFromPathSegments(['foo', 'bar', 'baz'])).toEqual(1);
  });
});
