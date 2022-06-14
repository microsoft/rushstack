// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { parseLocJson } from '../parseLocJson';

describe(parseLocJson.name, () => {
  it('parses a valid file', () => {
    const content: string = JSON.stringify({
      foo: {
        value: 'Foo',
        comment: 'A string'
      }
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
});
