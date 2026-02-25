// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { PackageName } from '../PackageName.ts';

describe(PackageName.name, () => {
  it(`${PackageName.isValidName.name} positive test`, () => {
    expect(PackageName.isValidName('@microsoft/example-package')).toEqual(true);
  });

  it(`${PackageName.isValidName.name} negative test`, () => {
    expect(PackageName.isValidName('@microsoft/example-package/path')).toEqual(false);
  });

  it(PackageName.tryParse.name, () => {
    expect(PackageName.tryParse('@microsoft/example-package')).toEqual({
      scope: '@microsoft',
      unscopedName: 'example-package',
      error: ''
    });

    expect(PackageName.tryParse('')).toEqual({
      scope: '',
      unscopedName: '',
      error: 'The package name must not be empty'
    });

    expect(
      PackageName.tryParse(undefined as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    ).toEqual({
      scope: '',
      unscopedName: '',
      error: 'The package name must not be null or undefined'
    });

    expect(PackageName.tryParse('@microsoft')).toEqual({
      scope: '@microsoft',
      unscopedName: '',
      error: 'Error parsing "@microsoft": The scope must be followed by a slash'
    });

    expect(PackageName.tryParse('@/example-package')).toEqual({
      scope: '@',
      unscopedName: 'example-package',
      error: 'Error parsing "@/example-package": The scope name cannot be empty'
    });

    expect(PackageName.tryParse('@Microsoft/example-package')).toEqual({
      scope: '@Microsoft',
      unscopedName: 'example-package',
      error: 'The package scope "@Microsoft" must not contain upper case characters'
    });

    expect(PackageName.tryParse('@micro!soft/example-package')).toEqual({
      scope: '@micro!soft',
      unscopedName: 'example-package',
      error: 'The package name "@micro!soft/example-package" contains an invalid character: "!"'
    });

    expect(PackageName.tryParse('@microsoft/node-co~re-library')).toEqual({
      scope: '@microsoft',
      unscopedName: 'node-co~re-library',
      error: 'The package name "@microsoft/node-co~re-library" contains an invalid character: "~"'
    });

    expect(PackageName.tryParse('@microsoft/example-package/path')).toEqual({
      scope: '@microsoft',
      unscopedName: 'example-package/path',
      error: 'The package name "@microsoft/example-package/path" contains an invalid character: "/"'
    });
  });

  it(PackageName.parse.name, () => {
    expect(() => {
      PackageName.parse('@');
    }).toThrowError('The scope must be followed by a slash');
  });

  it(PackageName.combineParts.name, () => {
    expect(PackageName.combineParts('@microsoft', 'example-package')).toEqual('@microsoft/example-package');

    expect(PackageName.combineParts('', 'example-package')).toEqual('example-package');
  });

  it(`${PackageName.combineParts.name} errors`, () => {
    expect(() => {
      PackageName.combineParts('', '@microsoft/example-package');
    }).toThrowError('The unscopedName cannot start with an "@" character');

    expect(() => {
      PackageName.combineParts('@micr!osoft', 'example-package');
    }).toThrowError('The package name "@micr!osoft/example-package" contains an invalid character: "!"');

    expect(() => {
      PackageName.combineParts('', '');
    }).toThrowError('The package name must not be empty');
  });
});
