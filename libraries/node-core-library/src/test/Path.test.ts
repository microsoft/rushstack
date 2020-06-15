// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'os';
import { Path } from '../Path';

describe('Path', () => {
  describe('Test', () => {
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
});
