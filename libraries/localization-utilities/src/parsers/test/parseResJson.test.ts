// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { parseResJson } from '../parseResJson';

describe(parseResJson.name, () => {
  it('parses a valid file', () => {
    const content: string = JSON.stringify({
      foo: 'Foo',
      '_foo.comment': 'A string'
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
});
