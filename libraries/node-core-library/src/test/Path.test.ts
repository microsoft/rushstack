// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/// <reference types='mocha' />

import * as os from 'os';
import { Path } from '../Path';
import { assert } from 'chai';

describe('Path', () => {
  describe('Test', () => {

    if (os.platform() === 'win32') {
      it('Windows paths', () => {
        assert.isTrue(Path.isUnder('C:\\a\\b.txt', 'C:\\a'), '1');
        assert.isTrue(Path.isUnder('C:\\a\\b.txt', 'C:\\a\\'), '2');
        assert.isTrue(Path.isUnder('C:\\a\\b\\c.txt', 'C:\\a'), '3');

        assert.isFalse(Path.isUnder('C:\\a\\b.txt', 'C:\\b'), '4');
        assert.isFalse(Path.isUnder('C:\\a\\b.txt', 'C:\\b\\'), '5');
        assert.isFalse(Path.isUnder('C:\\a\\b\\c.txt', 'C:\\b'), '6');

        assert.isFalse(Path.isUnder('C:\\a\\b.txt', 'D:\\a'), '7');
      });
    }

    it('Unix paths', () => {
      assert.isTrue(Path.isUnder('/a/b.txt', '/a'), '1');
      assert.isTrue(Path.isUnder('/a/b.txt', '/a/'), '2');
      assert.isTrue(Path.isUnder('/a/b/c.txt', '/a'), '3');

      assert.isFalse(Path.isUnder('/a/b.txt', '/b'), '4');
      assert.isFalse(Path.isUnder('/a/b.txt', '/b/'), '5');
      assert.isFalse(Path.isUnder('/a/b/c.txt', '/b'), '6');
    });
    it('Edge cases', () => {
      assert.isFalse(Path.isUnder('/a', '/a'), '1');
      assert.isFalse(Path.isUnder('.', '.'), '2');
      assert.isFalse(Path.isUnder('', ''), '3');
    });
    it('Relative paths', () => {
      assert.isTrue(Path.isUnder('a/b/c', 'a/b'), '1');
      assert.isTrue(Path.isUnder('./a/b/c', './a/b'), '2');
      assert.isTrue(Path.isUnder('../a/b/c', '../a/b'), '3');

      assert.isFalse(Path.isUnder('a/b', 'a/b/c'), '4');
      assert.isFalse(Path.isUnder('./a/b', './a/b/c'), '5');
      assert.isFalse(Path.isUnder('../a/b', '../a/b/c'), '6');
    });
  });
});
