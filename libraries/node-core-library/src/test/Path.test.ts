// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'node:os';
import * as path from 'node:path';
import { Path } from '../Path.ts';

describe(Path.name, () => {
  describe(Path.isUnder.name, () => {
    if (os.platform() === 'win32') {
      test('Windows paths', () => {
        expect(Path.isUnder('C:\\a\\b.txt', 'C:\\a')).toEqual(true);
        expect(Path.isUnder('C:\\a\\b.txt', 'C:\\a\\')).toEqual(true);
        expect(Path.isUnder('C:\\a\\b\\c.txt', 'C:\\a')).toEqual(true);

        expect(Path.isUnder('C:\\a\\b.txt', 'C:\\b')).toEqual(false);
        expect(Path.isUnder('C:\\a\\b.txt', 'C:\\b\\')).toEqual(false);
        expect(Path.isUnder('C:\\a\\b\\c.txt', 'C:\\b')).toEqual(false);

        expect(Path.isUnder('C:\\a\\b.txt', 'D:\\a')).toEqual(false);
      });
    }

    test('POSIX-style paths', () => {
      expect(Path.isUnder('/a/b.txt', '/a')).toEqual(true);
      expect(Path.isUnder('/a/b.txt', '/a/')).toEqual(true);
      expect(Path.isUnder('/a/b/c.txt', '/a')).toEqual(true);

      expect(Path.isUnder('/a/b.txt', '/b')).toEqual(false);
      expect(Path.isUnder('/a/b.txt', '/b/')).toEqual(false);
      expect(Path.isUnder('/a/b/c.txt', '/b')).toEqual(false);
    });
    test('Edge cases', () => {
      expect(Path.isUnder('/a', '/a')).toEqual(false);
      expect(Path.isUnder('.', '.')).toEqual(false);
      expect(Path.isUnder('', '')).toEqual(false);
    });
    test('Relative paths', () => {
      expect(Path.isUnder('a/b/c', 'a/b')).toEqual(true);
      expect(Path.isUnder('./a/b/c', './a/b')).toEqual(true);
      expect(Path.isUnder('../a/b/c', '../a/b')).toEqual(true);

      expect(Path.isUnder('a/b', 'a/b/c')).toEqual(false);
      expect(Path.isUnder('./a/b', './a/b/c')).toEqual(false);
      expect(Path.isUnder('../a/b', '../a/b/c')).toEqual(false);
    });
  });

  describe(Path.isDownwardRelative.name, () => {
    test('Positive cases', () => {
      expect(Path.isDownwardRelative('folder')).toEqual(true);
      expect(Path.isDownwardRelative('folder/')).toEqual(true);
      expect(Path.isDownwardRelative('./folder')).toEqual(true);
      expect(Path.isDownwardRelative('./folder/file')).toEqual(true);
      expect(Path.isDownwardRelative('./folder/file')).toEqual(true);

      if (os.platform() === 'win32') {
        expect(Path.isDownwardRelative('folder\\')).toEqual(true);
        expect(Path.isDownwardRelative('.\\folder')).toEqual(true);
        expect(Path.isDownwardRelative('.\\folder\\file')).toEqual(true);
        expect(Path.isDownwardRelative('.\\folder\\file')).toEqual(true);
      }
    });
    test('Degenerate positive cases', () => {
      expect(Path.isDownwardRelative('folder/degenerate...')).toEqual(true);
      expect(Path.isDownwardRelative('folder/...degenerate')).toEqual(true);
      expect(Path.isDownwardRelative('folder/...degenerate...')).toEqual(true);
      expect(Path.isDownwardRelative('folder/degenerate.../file')).toEqual(true);
      expect(Path.isDownwardRelative('folder/...degenerate/file')).toEqual(true);
      expect(Path.isDownwardRelative('folder/...degenerate.../file')).toEqual(true);
      expect(Path.isDownwardRelative('...degenerate/file')).toEqual(true);
      expect(Path.isDownwardRelative('.../file')).toEqual(true);
      expect(Path.isDownwardRelative('...')).toEqual(true);
    });
    test('Negative cases', () => {
      expect(Path.isDownwardRelative('../folder')).toEqual(false);
      expect(Path.isDownwardRelative('../folder/folder')).toEqual(false);
      expect(Path.isDownwardRelative('folder/../folder')).toEqual(false);
      expect(Path.isDownwardRelative('/folder/file')).toEqual(false);

      if (os.platform() === 'win32') {
        expect(Path.isDownwardRelative('C:/folder/file')).toEqual(false);
        expect(Path.isDownwardRelative('..\\folder')).toEqual(false);
        expect(Path.isDownwardRelative('..\\folder\\folder')).toEqual(false);
        expect(Path.isDownwardRelative('folder\\..\\folder')).toEqual(false);
        expect(Path.isDownwardRelative('\\folder\\file')).toEqual(false);
        expect(Path.isDownwardRelative('C:\\folder\\file')).toEqual(false);
      }
    });
  });
  describe(Path.formatConcisely.name, () => {
    describe('With trimLeadingDotSlash unset', () => {
      it('Formats a path under a base folder', () => {
        const result: string = Path.formatConcisely({
          pathToConvert: '/folder1/folder2/folder3',
          baseFolder: '/folder1'
        });
        expect(result).toMatchInlineSnapshot(`"./folder2/folder3"`);
        expect(path.isAbsolute(result)).toBe(false);
      });

      it('Formats a path not under the base folder', () => {
        const result: string = Path.formatConcisely({
          pathToConvert: '/folder1/folder2/folder3',
          baseFolder: '/folder4'
        });
        // We can't do a snapshot test here because the result is OS-specific
        // expect(result).toMatchInlineSnapshot();
        expect(path.isAbsolute(result)).toBe(true);
      });

      it('Formats a path containing a ".." under a base folder', () => {
        const result: string = Path.formatConcisely({
          pathToConvert: '/folder1/folder2/folder3/folder4/../file.txt',
          baseFolder: '/folder1/folder2/folder3'
        });
        expect(result).toMatchInlineSnapshot(`"./file.txt"`);
        expect(path.isAbsolute(result)).toBe(false);
      });
    });

    describe('With trimLeadingDotSlash set to true', () => {
      it('Formats a path under a base folder', () => {
        const result: string = Path.formatConcisely({
          pathToConvert: '/folder1/folder2/folder3',
          baseFolder: '/folder1',
          trimLeadingDotSlash: true
        });
        expect(result).toMatchInlineSnapshot(`"folder2/folder3"`);
        expect(path.isAbsolute(result)).toBe(false);
      });

      it('Formats a path not under the base folder', () => {
        const result: string = Path.formatConcisely({
          pathToConvert: '/folder1/folder2/folder3',
          baseFolder: '/folder4',
          trimLeadingDotSlash: true
        });
        // We can't do a snapshot test here because the result is OS-specific
        // expect(result).toMatchInlineSnapshot();
        expect(path.isAbsolute(result)).toBe(true);
      });

      it('Formats a path containing a ".." under a base folder', () => {
        const result: string = Path.formatConcisely({
          pathToConvert: '/folder1/folder2/folder3/folder4/../file.txt',
          baseFolder: '/folder1/folder2/folder3',
          trimLeadingDotSlash: true
        });
        expect(result).toMatchInlineSnapshot(`"file.txt"`);
        expect(path.isAbsolute(result)).toBe(false);
      });
    });
  });
});
