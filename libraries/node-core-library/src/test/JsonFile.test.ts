// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { JsonFile } from '../JsonFile';

// The PosixModeBits are intended to be used with bitwise operations.

describe(JsonFile.name, () => {
  it('adds a header comment', () => {
    expect(
      JsonFile.stringify(
        { abc: 123 },
        {
          headerComment: '// header\n// comment'
        }
      )
    ).toMatchSnapshot();
  });

  it('adds an empty header comment', () => {
    expect(
      JsonFile.stringify(
        { abc: 123 },
        {
          headerComment: ''
        }
      )
    ).toMatchSnapshot();
  });

  it('allows undefined values when asked', () => {
    expect(
      JsonFile.stringify(
        { abc: undefined },
        {
          ignoreUndefinedValues: true
        }
      )
    ).toMatchSnapshot();

    expect(
      JsonFile.stringify(
        { abc: undefined },
        {
          ignoreUndefinedValues: true,
          prettyFormatting: true
        }
      )
    ).toMatchSnapshot();
  });

  it('supports updating a simple file', () => {
    expect(JsonFile.updateString('{"a": 1}', { a: 1, b: 2 })).toMatchSnapshot();
  });

  it('supports updating a simple file with a comment', () => {
    expect(JsonFile.updateString(`{\n  // comment\n  "a": 1\n}`, { a: 1, b: 2 })).toMatchSnapshot();
  });

  it('supports updating a simple file with a comment and a trailing comma', () => {
    expect(JsonFile.updateString(`{\n  // comment\n  "a": 1,\n}`, { a: 1, b: 2 })).toMatchSnapshot();
  });

  it('supports updating a simple file with an unquoted property', () => {
    expect(
      JsonFile.updateString(`{\n  // comment\n  a: 1,\n}`, { a: 1, b: 2, 'c-123': 3 })
    ).toMatchSnapshot();
  });

  it('supports parsing keys that map to `Object` properties', () => {
    const propertyStrings: string[] = [];
    for (const objectKey of Object.getOwnPropertyNames(Object.prototype).sort()) {
      propertyStrings.push(`"${objectKey}": 1`);
    }

    const jsonString: string = `{\n  ${propertyStrings.join(',\n  ')}\n}`;
    expect(jsonString).toMatchSnapshot('JSON String');
    expect(JsonFile.parseString(jsonString)).toMatchSnapshot('Parsed JSON Object');
  });
});
