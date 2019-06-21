// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { PackageName } from '../PackageName';

describe('PackageName', () => {
  describe('Test', () => {

    test('isValidName() positive test', () => {
      expect(PackageName.isValidName('@microsoft/node-core-library')).toEqual(true);
    });

    test('isValidName() negative test', () => {
      expect(PackageName.isValidName('@microsoft/node-core-library/path')).toEqual(false);
    });

    test('tryParse() tests', () => {
      expect(
        PackageName.tryParse('@microsoft/node-core-library')
      ).toEqual(
        {
          scope: '@microsoft',
          unscopedName: 'node-core-library',
          error: ''
        }
      );

      expect(
        PackageName.tryParse('')
      ).toEqual(
        {
          scope: '',
          unscopedName: '',
          error: 'The package name must not be empty'
        }
      );

      expect(
        PackageName.tryParse(undefined as any) // tslint:disable-line:no-any
      ).toEqual(
        {
          scope: '',
          unscopedName: '',
          error: 'The package name must not be null or undefined'
        }
      );

      expect(
        PackageName.tryParse('@microsoft')
      ).toEqual(
        {
          scope: '@microsoft',
          unscopedName: '',
          error: 'Error parsing "@microsoft": The scope must be followed by a slash'
        }
      );

      expect(
        PackageName.tryParse('@/node-core-library')
      ).toEqual(
        {
          scope: '@',
          unscopedName: 'node-core-library',
          error: 'Error parsing "@/node-core-library": The scope name cannot be empty'
        }
      );

      expect(
        PackageName.tryParse('@Microsoft/node-core-library')
      ).toEqual(
        {
          scope: '@Microsoft',
          unscopedName: 'node-core-library',
          error: 'The package scope "@Microsoft" must not contain upper case characters'
        }
      );

      expect(
        PackageName.tryParse('@micro!soft/node-core-library')
      ).toEqual(
        {
          scope: '@micro!soft',
          unscopedName: 'node-core-library',
          error: 'The package name "@micro!soft/node-core-library" contains an invalid character: \"!\"'
        }
      );

      expect(
        PackageName.tryParse('@microsoft/node-co~re-library')
      ).toEqual(
        {
          scope: '@microsoft',
          unscopedName: 'node-co~re-library',
          error: 'The package name "@microsoft/node-co~re-library" contains an invalid character: \"~\"'
        }
      );

      expect(
        PackageName.tryParse('@microsoft/node-core-library/path')
      ).toEqual(
        {
          scope: '@microsoft',
          unscopedName: 'node-core-library/path',
          error: 'The package name "@microsoft/node-core-library/path" contains an invalid character: \"/\"'
        }
      );

    });
  });

  test('parse() test', () => {
    expect(
      () => { PackageName.parse('@'); }
    ).toThrowError('The scope must be followed by a slash');
  });

  test('combineParts() tests', () => {
    expect(PackageName.combineParts('@microsoft', 'node-core-library'))
      .toEqual('@microsoft/node-core-library');

    expect(PackageName.combineParts('', 'node-core-library'))
      .toEqual('node-core-library');
  });

  test('combineParts() errors', () => {
    expect(() => {
      PackageName.combineParts('', '@microsoft/node-core-library');
    }).toThrowError('The unscopedName cannot start with an "@" character');

    expect(() => {
      PackageName.combineParts('@micr!osoft', 'node-core-library');
    }).toThrowError('The package name "@micr!osoft/node-core-library" contains an invalid character: "!"');

    expect(() => {
      PackageName.combineParts('', '');
    }).toThrowError('The package name must not be empty');
  });
});
