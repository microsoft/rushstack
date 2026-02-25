// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IgnoreStringFunction } from '../../interfaces.ts';
import { parseResJson } from '../parseResJson.ts';

describe(parseResJson.name, () => {
  it('parses a valid file', () => {
    const content: string = JSON.stringify({
      foo: 'Foo',
      '_foo.comment': 'A string',
      bar: 'Bar',
      '_bar.comment': 'Another string'
    });

    expect(
      parseResJson({
        content,
        filePath: 'test.resjson'
      })
    ).toMatchSnapshot();
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
      parseResJson({
        content,
        filePath: 'test.resjson',
        ignoreString: ignoredStringFunction
      })
    ).toMatchSnapshot('Loc file');

    expect((ignoredStringFunction as unknown as jest.SpyInstance).mock.calls).toMatchSnapshot(
      'ignoreStrings calls'
    );
  });
});
