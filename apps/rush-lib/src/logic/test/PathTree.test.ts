import { PathTree } from '../PathTree';

describe('iteratePathSegments', () => {
  it('returns empty for an empty string', () => {
    const result = [...PathTree.iteratePathSegments('')];
    expect(result.length).toEqual(0);
  });
  it('returns the only segment of a trival string', () => {
    const result = [...PathTree.iteratePathSegments('foo')];
    expect(result).toEqual(['foo']);
  });
  it('treats backslashes as ordinary characters, per POSIX', () => {
    const result = [...PathTree.iteratePathSegments('foo\\bar\\baz')];
    expect(result).toEqual(['foo\\bar\\baz']);
  });
  it('iterates segments', () => {
    const result = [...PathTree.iteratePathSegments('foo/bar/baz')];
    expect(result).toEqual(['foo', 'bar', 'baz']);
  });
});

describe('getNearestParent', () => {
  it('returns empty for an empty tree', () => {
    expect(new PathTree().getNearestParent('foo')).toEqual(undefined);
  });
  it('returns the matching node for a trivial tree', () => {
    expect(new PathTree([['foo', 1]]).getNearestParent('foo')).toEqual(1);
  });
  it('returns the matching node for a single-layer tree', () => {
    const tree: PathTree<number> = new PathTree([
      ['foo', 1],
      ['bar', 2],
      ['baz', 3]
    ]);

    expect(tree.getNearestParent('foo')).toEqual(1);
    expect(tree.getNearestParent('bar')).toEqual(2);
    expect(tree.getNearestParent('baz')).toEqual(3);
    expect(tree.getNearestParent('buzz')).toEqual(undefined);
  });
  it('returns the matching parent for multi-layer queries', () => {
    const tree: PathTree<number> = new PathTree([
      ['foo', 1],
      ['bar', 2],
      ['baz', 3]
    ]);

    expect(tree.getNearestParent('foo/bar')).toEqual(1);
    expect(tree.getNearestParent('bar/baz')).toEqual(2);
    expect(tree.getNearestParent('baz/foo')).toEqual(3);
    expect(tree.getNearestParent('foo/foo')).toEqual(1);
  });
  it('returns the matching parent for multi-layer queries in multi-layer trees', () => {
    const tree: PathTree<number> = new PathTree([
      ['foo', 1],
      ['bar', 2],
      ['baz', 3],
      ['foo/bar', 4],
      ['foo/bar/baz', 5],
      ['baz/foo', 6],
      ['baz/baz/baz/baz', 7]
    ]);

    expect(tree.getNearestParent('foo/foo')).toEqual(1);
    expect(tree.getNearestParent('foo/bar\\baz')).toEqual(1);

    expect(tree.getNearestParent('bar/baz')).toEqual(2);

    expect(tree.getNearestParent('baz/bar')).toEqual(3);
    expect(tree.getNearestParent('baz/baz')).toEqual(3);
    expect(tree.getNearestParent('baz/baz/baz')).toEqual(3);

    expect(tree.getNearestParent('foo/bar')).toEqual(4);
    expect(tree.getNearestParent('foo/bar/foo')).toEqual(4);

    expect(tree.getNearestParent('foo/bar/baz')).toEqual(5);
    expect(tree.getNearestParent('foo/bar/baz/baz/baz/baz/baz')).toEqual(5);

    expect(tree.getNearestParent('baz/foo/')).toEqual(6);

    expect(tree.getNearestParent('baz/baz/baz/baz')).toEqual(7);

    expect(tree.getNearestParent('')).toEqual(undefined);
    expect(tree.getNearestParent('foofoo')).toEqual(undefined);
    expect(tree.getNearestParent('foo\\bar\\baz')).toEqual(undefined);
  });
});
