// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/// <reference types='mocha' />

import { PackageName } from '../PackageName';
import { assert } from 'chai';

describe('PackageName', () => {
  describe('Test', () => {

    it('isValidName() positive test', () => {
      assert.isTrue(PackageName.isValidName('@microsoft/node-core-library'));
    });

    it('isValidName() negative test', () => {
      assert.isFalse(PackageName.isValidName('@microsoft/node-core-library/path'));
    });

    it('tryParse() tests', () => {
      assert.deepEqual(
        PackageName.tryParse('@microsoft/node-core-library'),
        {
          scope: '@microsoft',
          unscopedName: 'node-core-library',
          error: ''
        }
      );

      assert.deepEqual(
        PackageName.tryParse(''),
        {
          scope: '',
          unscopedName: '',
          error: 'The package name must not be empty'
        }
      );

      assert.deepEqual(
        PackageName.tryParse(undefined as any), // tslint:disable-line:no-any
        {
          scope: '',
          unscopedName: '',
          error: 'The package name must not be null or undefined'
        }
      );

      assert.deepEqual(
        PackageName.tryParse('@microsoft'),
        {
          scope: '@microsoft',
          unscopedName: '',
          error: 'Error parsing "@microsoft": The scope must be followed by a slash'
        }
      );

      assert.deepEqual(
        PackageName.tryParse('@/node-core-library'),
        {
          scope: '@',
          unscopedName: 'node-core-library',
          error: 'Error parsing "@/node-core-library": The scope name cannot be empty'
        }
      );

      assert.deepEqual(
        PackageName.tryParse('@Microsoft/node-core-library'),
        {
          scope: '@Microsoft',
          unscopedName: 'node-core-library',
          error: 'The package scope "@Microsoft" must not contain upper case characters'
        }
      );

      assert.deepEqual(
        PackageName.tryParse('@micro!soft/node-core-library'),
        {
          scope: '@micro!soft',
          unscopedName: 'node-core-library',
          error: 'The package name "@micro!soft/node-core-library" contains an invalid character: \"!\"'
        }
      );

      assert.deepEqual(
        PackageName.tryParse('@microsoft/node-co~re-library'),
        {
          scope: '@microsoft',
          unscopedName: 'node-co~re-library',
          error: 'The package name "@microsoft/node-co~re-library" contains an invalid character: \"~\"'
        }
      );

      assert.deepEqual(
        PackageName.tryParse('@microsoft/node-core-library/path'),
        {
          scope: '@microsoft',
          unscopedName: 'node-core-library/path',
          error: 'The package name "@microsoft/node-core-library/path" contains an invalid character: \"/\"'
        }
      );

    });
  });

  it('parse() test', () => {
    assert.throws(() => { PackageName.parse('@'); }, 'The scope must be followed by a slash');
  });

  it('combineParts() tests', () => {
    assert.equal(PackageName.combineParts('@microsoft', 'node-core-library'),
      '@microsoft/node-core-library');

    assert.equal(PackageName.combineParts('', 'node-core-library'),
      'node-core-library');
  });

  it('combineParts() errors', () => {
    assert.throws(() => { PackageName.combineParts('', '@microsoft/node-core-library'); },
      'The unscopedName cannot start with an "@" character');

    assert.throws(() => { PackageName.combineParts('@micr!osoft', 'node-core-library'); },
      'The package name "@micr!osoft/node-core-library" contains an invalid character: "!"');

    assert.throws(() => { PackageName.combineParts('', ''); },
      'The package name must not be empty');
   });

});
