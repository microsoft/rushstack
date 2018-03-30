// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/// <reference types='mocha' />

import { PackageName } from '../PackageName';
import { assert } from 'chai';

describe('PackageName', () => {
  describe('Test', () => {

    it('isValidName positive test', () => {
      assert.isTrue(PackageName.isValidName('@microsoft/node-core-library'));
    });

    it('isValidName negative test', () => {
      assert.isFalse(PackageName.isValidName('@microsoft/node-core-library/path'));
    });

    it('tryParse tests', () => {
      assert.deepEqual(
        PackageName.tryParse('@microsoft/node-core-library/path'),
        {
          scope: '@microsoft/',
          unscopedName: 'node-core-library',
          path: '/path',
          error: ''
        }
      );

      assert.deepEqual(
        PackageName.tryParse(''),
        {
          scope: '',
          unscopedName: '',
          path: '',
          error: 'The package name must not be empty'
        }
      );

      assert.deepEqual(
        PackageName.tryParse(undefined as any), // tslint:disable-line:no-any
        {
          scope: '',
          unscopedName: '',
          path: '',
          error: 'The value must not be null or undefined'
        }
      );

      assert.deepEqual(
        PackageName.tryParse('@microsoft'),
        {
          scope: '',
          unscopedName: '',
          path: '',
          error: 'The scope must be followed by a slash'
        }
      );

      assert.deepEqual(
        PackageName.tryParse('@Microsoft/node-core-library'),
        {
          scope: '@Microsoft/',
          unscopedName: 'node-core-library',
          path: '',
          error: 'The package name must not contain upper case characters'
        }
      );

      assert.deepEqual(
        PackageName.tryParse('@micro!soft/node-core-library/path'),
        {
          scope: '@micro!soft/',
          unscopedName: 'node-core-library',
          path: '/path',
          error: 'The package name contains an invalid character: \"!\"'
        }
      );

      assert.deepEqual(
        PackageName.tryParse('@microsoft/node-co~re-library/path'),
        {
          scope: '@microsoft/',
          unscopedName: 'node-co~re-library',
          path: '/path',
          error: 'The package name contains an invalid character: \"~\"'
        }
      );

    });
  });
});
