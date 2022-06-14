// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { IgnoreStringFunction } from '../../interfaces';
import { parseLocJson } from '../parseLocJson';
import { serializeLocFile } from './serializeLocFile';

describe(parseLocJson.name, () => {
  it('parses a valid file', () => {
    const content: string = JSON.stringify({
      foo: {
        value: 'Foo',
        comment: 'A string'
      },
      bar: {
        value: 'Bar',
        comment: 'Another string'
      }
    });

    expect(
      serializeLocFile(
        parseLocJson({
          content,
          filePath: 'test.loc.json'
        })
      )
    ).toMatchInlineSnapshot(`
      "key | value | comment
      ------------------------------
       foo | Foo   | A string
       bar | Bar   | Another string"
    `);
  });

  it('throws on invalid file', () => {
    const content: string = JSON.stringify({
      foo: {
        value: 'Foo',
        baz: 'A string'
      }
    });

    expect(() =>
      parseLocJson({
        content,
        filePath: 'test.loc.json'
      })
    ).toThrowErrorMatchingSnapshot();
  });

  it('correctly ignores a string', () => {
    const content: string = JSON.stringify({
      foo: {
        value: 'Foo',
        comment: 'A string'
      },
      bar: {
        value: 'Bar',
        comment: 'Another string'
      }
    });

    const ignoredStringFunction: IgnoreStringFunction = jest
      .fn()
      .mockImplementation(
        (fileName: string, stringName: string) => fileName === 'test.loc.json' && stringName === 'bar'
      );

    expect(
      serializeLocFile(
        parseLocJson({
          content,
          filePath: 'test.loc.json',
          ignoreString: ignoredStringFunction as IgnoreStringFunction
        })
      )
    ).toMatchInlineSnapshot(`
      "key | value | comment
      ------------------------
       foo | Foo   | A string"
    `);

    expect((ignoredStringFunction as unknown as jest.SpyInstance).mock.calls).toMatchInlineSnapshot(`
      Array [
        Array [
          "test.loc.json",
          "foo",
        ],
        Array [
          "test.loc.json",
          "bar",
        ],
      ]
    `);
  });
});
