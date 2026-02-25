// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as lockfilePath from '../lockfilePath.ts';

describe('lockfilePath', () => {
  it('getBaseNameOf', () => {
    expect(lockfilePath.getBaseNameOf('/a/b/c/d')).toBe('d');
    expect(lockfilePath.getBaseNameOf('.')).toBe('.');
    expect(lockfilePath.getBaseNameOf('')).toBe('');

    expect(() => lockfilePath.getParentOf('/a/')).toThrowError('has a trailing slash');
  });

  it('getParentOf', () => {
    expect(lockfilePath.getParentOf('a/b/c/d')).toBe('a/b/c');
    expect(lockfilePath.getParentOf('/a/b/c')).toBe('/a/b');
    expect(lockfilePath.getParentOf('/a/b')).toBe('/a');
    expect(lockfilePath.getParentOf('/a')).toBe('/');
    expect(lockfilePath.getParentOf('a')).toBe('.');

    expect(() => lockfilePath.getParentOf('')).toThrowError('has no parent');
    expect(() => lockfilePath.getParentOf('/')).toThrowError('has no parent');
    expect(() => lockfilePath.getParentOf('.')).toThrowError('has no parent');
    expect(() => lockfilePath.getParentOf('/a/')).toThrowError('has a trailing slash');
  });

  it('getAbsolute', () => {
    expect(lockfilePath.getAbsolute('a/b/c', 'd/e')).toBe('a/b/c/d/e');
    expect(lockfilePath.getAbsolute('/a/b/c', 'd/e')).toBe('/a/b/c/d/e');
    expect(lockfilePath.getAbsolute('/a/b/c', '/d/e')).toBe('/d/e');
    expect(lockfilePath.getAbsolute('a/b/c', '../../f')).toBe('a/f');
    expect(lockfilePath.getAbsolute('a/b/c', '.././/f')).toBe('a/b/f');
    expect(lockfilePath.getAbsolute('a/b/c', '../../..')).toBe('.');
    expect(lockfilePath.getAbsolute('C:/a/b', '../d')).toBe('C:/a/d');

    // Error case
    expect(() => lockfilePath.getAbsolute('a/b/c', '../../../..')).toThrowError('goes above the root folder');

    // Degenerate cases
    expect(lockfilePath.getAbsolute('a/b/c/', 'd/')).toBe('a/b/c/d');
    expect(lockfilePath.getAbsolute('./../c', 'd')).toBe('./../c/d');
    expect(lockfilePath.getAbsolute('C:\\', '\\a')).toBe('C:\\/\\a');
  });

  it('join', () => {
    expect(lockfilePath.join('', 'a')).toBe('a');
    expect(lockfilePath.join('b', '')).toBe('b');
    expect(lockfilePath.join('a', 'b')).toBe('a/b');
    expect(lockfilePath.join('a/', 'b')).toBe('a/b');
    expect(lockfilePath.join('a', '/b')).toBe('a/b');
    expect(lockfilePath.join('a/', '/b')).toBe('a/b');

    // Degenerate cases
    expect(lockfilePath.join('a//', '/b')).toBe('a//b');
  });
});
