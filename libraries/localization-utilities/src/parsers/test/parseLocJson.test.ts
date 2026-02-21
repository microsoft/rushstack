// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IgnoreStringFunction } from '../../interfaces.ts';
import { parseLocJson } from '../parseLocJson.ts';

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
      parseLocJson({
        content,
        filePath: 'test.loc.json'
      })
    ).toMatchSnapshot();
  });

  it('parses a file with raw strings', () => {
    const content: string = JSON.stringify({
      foo: 'Foo',
      bar: 'Bar'
    });

    expect(
      parseLocJson({
        content,
        filePath: 'test.loc.json'
      })
    ).toMatchSnapshot();
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
      parseLocJson({
        content,
        filePath: 'test.loc.json',
        ignoreString: ignoredStringFunction
      })
    ).toMatchSnapshot('Loc file');

    expect((ignoredStringFunction as unknown as jest.SpyInstance).mock.calls).toMatchSnapshot(
      'ignoreStrings calls'
    );
  });
});
