// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileDeletionUtility } from './../FileDeletionUtility';

describe('FileDeletionUtility', () => {
  describe('constructor', () => {
    it('can be constructed', () => {
      const test: FileDeletionUtility = new FileDeletionUtility();
      expect(test).not.toBeNull();
    });
  });
  describe('isParentDirectory', () => {
    it('can detect an immediate child', () => {
      expect(FileDeletionUtility.isParentDirectory('/a', '/a/b.txt')).toEqual(true);
    });
    it('can detect a deep child', () => {
      expect(FileDeletionUtility.isParentDirectory('/a', '/a/b/c/d.txt')).toEqual(true);
    });
    it('can detect if base path is longer', () => {
      expect(FileDeletionUtility.isParentDirectory('/a/b/c/d', '/a/b/c/d/g.txt')).toEqual(true);
    });
    it('can detect siblings', () => {
      expect(FileDeletionUtility.isParentDirectory('/a/b', '/a/c')).toEqual(false);
    });
    it('can detect siblings with file extensions', () => {
      expect(FileDeletionUtility.isParentDirectory('/a/b/c.txt', '/a/b/d.txt')).toEqual(false);
    });
    it('can detect when not a parent', () => {
      expect(FileDeletionUtility.isParentDirectory('/a/b/c', '/a')).toEqual(false);
      expect(FileDeletionUtility.isParentDirectory('/a/b/c', '/a/b.txt')).toEqual(false);
    });
    it('accepts anything under the root', () => {
      expect(FileDeletionUtility.isParentDirectory('/', '/a.txt')).toEqual(true);
      expect(FileDeletionUtility.isParentDirectory('/', '/a/b/c/d.txt')).toEqual(true);
    });
    it('it is case sensitive', () => {
      expect(FileDeletionUtility.isParentDirectory('/a', '/A/b.txt')).toEqual(false);
      expect(FileDeletionUtility.isParentDirectory('/a', '/a/b.txt')).toEqual(true);
      expect(FileDeletionUtility.isParentDirectory('/a/B/c', '/a/b/c/d.txt')).toEqual(false);
    });
    it('it does not accept null or undefined', () => {
      /* eslint-disable @rushstack/no-null */
      expect(FileDeletionUtility.isParentDirectory('', '/A/b.txt')).toEqual(false);
      expect(FileDeletionUtility.isParentDirectory(undefined, '/a/b.txt')).toEqual(false);
      expect(
        FileDeletionUtility.isParentDirectory(null as any, '/a/b/c/d.txt') // eslint-disable-line @typescript-eslint/no-explicit-any
      ).toEqual(false);
      expect(FileDeletionUtility.isParentDirectory('/A/b.txt', '')).toEqual(false);
      expect(FileDeletionUtility.isParentDirectory('/a/b.txt', undefined)).toEqual(false);
      expect(
        FileDeletionUtility.isParentDirectory('/a/b/c/d.txt', null as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      ).toEqual(false);
      /* eslint-enable @rushstack/no-null */
    });
  });
  describe('removeChildren', () => {
    it('removes children of a parent', () => {
      const files: string[] = [
        '/a',
        '/a/b',
        '/a/b/c.txt',
        '/a/b/d.txt',
        '/a/z',
        '/b/f/g',
        '/b/f/ggg',
        '/b/f/ggg/foo.txt',
        '/c',
        '/c/a.txt',
        '/c/f/g/h/j/k/l/q',
        '/d',
      ];
      const expected: string[] = ['/a', '/b/f/g', '/b/f/ggg', '/c', '/d'];
      const actual: string[] = FileDeletionUtility.removeChildren(files);

      expect(actual).toHaveLength(expected.length);
      expect(expected).toEqual(actual);
    });
    it('removes everything under the root', () => {
      const files: string[] = [
        '/',
        '/a/b',
        '/a/b/c.txt',
        '/a/b/d.txt',
        '/a/z',
        '/b/f/g',
        '/b/f/ggg',
        '/b/f/ggg/foo.txt',
        '/c',
        '/c/a.txt',
        '/c/f/g/h/j/k/l/q',
        '/d',
      ];
      const expected: string[] = ['/'];
      const actual: string[] = FileDeletionUtility.removeChildren(files);

      expect(actual).toHaveLength(expected.length);
      expect(expected).toEqual(actual);
    });
  });
});
