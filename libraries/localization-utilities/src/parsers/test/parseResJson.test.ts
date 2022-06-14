// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { IgnoreStringFunction } from '../../interfaces';
import { parseResJson } from '../parseResJson';
import { serializeLocFile } from './serializeLocFile';

describe(parseResJson.name, () => {
  it('parses a valid file', () => {
    const content: string = JSON.stringify({
      foo: 'Foo',
      '_foo.comment': 'A string',
      bar: 'Bar',
      '_bar.comment': 'Another string'
    });

    expect(
      serializeLocFile(
        parseResJson({
          content,
          filePath: 'test.resjson'
        })
      )
    ).toMatchInlineSnapshot(`
      "key | value | comment
      ------------------------------
       foo | Foo   | A string
       bar | Bar   | Another string"
    `);
  });

  it('throws on excess comments', () => {
    const content: string = JSON.stringify({
      foo: 'Foo',
      '_bar.comment': 'A string'
    });

    expect(() =>
      parseResJson({
        content,
        filePath: 'test.resjson'
      })
    ).toThrowErrorMatchingSnapshot();
  });

  it('correctly ignores a string', () => {
    const content: string = JSON.stringify({
      foo: 'Foo',
      '_foo.comment': 'A string',
      bar: 'Bar',
      '_bar.comment': 'Another string'
    });

    const ignoredStringFunction: IgnoreStringFunction = jest
      .fn()
      .mockImplementation(
        (fileName: string, stringName: string) => fileName === 'test.resjson' && stringName === 'bar'
      );

    expect(
      serializeLocFile(
        parseResJson({
          content,
          filePath: 'test.resjson',
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
          "test.resjson",
          "foo",
        ],
        Array [
          "test.resjson",
          "bar",
        ],
      ]
    `);
  });
});
