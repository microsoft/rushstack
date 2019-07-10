// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { assert } from 'chai';
import { FileDeletionUtility } from './../FileDeletionUtility';

describe('FileDeletionUtility', () => {
  describe('constructor', () => {
    it('can be constructed', () => {
      // tslint:disable-next-line:no-unused-variable
      const test: FileDeletionUtility = new FileDeletionUtility();
      assert.isNotNull(test);
    });
  });
  describe('isParentDirectory', () => {
    it('can detect an immediate child', () => {
      assert.isTrue(FileDeletionUtility.isParentDirectory('/a', '/a/b.txt'));
    });
    it('can detect a deep child', () => {
      assert.isTrue(FileDeletionUtility.isParentDirectory('/a', '/a/b/c/d.txt'));
    });
    it('can detect if base path is longer', () => {
      assert.isTrue(FileDeletionUtility.isParentDirectory('/a/b/c/d', '/a/b/c/d/g.txt'));
    });
    it('can detect siblings', () => {
      assert.isFalse(FileDeletionUtility.isParentDirectory('/a/b', '/a/c'));
    });
    it('can detect siblings with file extensions', () => {
      assert.isFalse(FileDeletionUtility.isParentDirectory('/a/b/c.txt', '/a/b/d.txt'));
    });
    it('can detect when not a parent', () => {
      assert.isFalse(FileDeletionUtility.isParentDirectory('/a/b/c', '/a'));
      assert.isFalse(FileDeletionUtility.isParentDirectory('/a/b/c', '/a/b.txt'));
    });
    it('accepts anything under the root', () => {
      assert.isTrue(FileDeletionUtility.isParentDirectory('/', '/a.txt'));
      assert.isTrue(FileDeletionUtility.isParentDirectory('/', '/a/b/c/d.txt'));
    });
    it('it is case sensitive', () => {
      assert.isFalse(FileDeletionUtility.isParentDirectory('/a', '/A/b.txt'));
      assert.isTrue(FileDeletionUtility.isParentDirectory('/a', '/a/b.txt'));
      assert.isFalse(FileDeletionUtility.isParentDirectory('/a/B/c', '/a/b/c/d.txt'));
    });
    it('it does not accept null or undefined', () => {
      /* tslint:disable:no-null-keyword */
      assert.isFalse(FileDeletionUtility.isParentDirectory('', '/A/b.txt'));
      assert.isFalse(FileDeletionUtility.isParentDirectory(undefined, '/a/b.txt'));
      assert.isFalse(
        FileDeletionUtility.isParentDirectory(null as any, '/a/b/c/d.txt') // tslint:disable-line:no-any
      );
      assert.isFalse(FileDeletionUtility.isParentDirectory('/A/b.txt', ''));
      assert.isFalse(FileDeletionUtility.isParentDirectory('/a/b.txt', undefined));
      assert.isFalse(
        FileDeletionUtility.isParentDirectory('/a/b/c/d.txt', null as any) // tslint:disable-line:no-any
      );
      /* tslint:enable:no-null-keyword */
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
        '/d'
      ];
      const expected: string[] = ['/a', '/b/f/g', '/b/f/ggg', '/c', '/d'];
      const actual: string[] = FileDeletionUtility.removeChildren(files);

      assert.equal(actual.length, expected.length);
      assert.includeMembers(expected, actual);
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
        '/d'
      ];
      const expected: string[] = ['/'];
      const actual: string[] = FileDeletionUtility.removeChildren(files);

      assert.equal(actual.length, expected.length);
      assert.includeMembers(expected, actual);
    });
  });
});
