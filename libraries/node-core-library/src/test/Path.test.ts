// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'os';
import * as path from 'path';
import { Path } from '../Path';

describe('Path', () => {
  describe('isUnder', () => {
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

  describe('isDownwardRelative', () => {
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
  describe('formatConcisely', () => {
    test('tests', () => {
      expect(
        Path.formatConcisely({ pathToConvert: '/folder1/folder2/folder3', baseFolder: '/folder1' })
      ).toEqual('./folder2/folder3');
      expect(
        path.isAbsolute(
          Path.formatConcisely({ pathToConvert: '/folder1/folder2/folder3', baseFolder: '/folder4' })
        )
      ).toBe(true);
      expect(
        Path.formatConcisely({
          pathToConvert: '/folder1/folder2/folder3/folder4/../file.txt',
          baseFolder: '/folder1/folder2/folder3'
        })
      ).toEqual('./file.txt');
    });
  });
});
