// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Text, NewlineKind } from '@rushstack/node-core-library';
import type { TextRewriterState } from '../TextRewriter.ts';
import { NormalizeNewlinesTextRewriter } from '../NormalizeNewlinesTextRewriter.ts';

function testCase(input: string): void {
  const matcher: NormalizeNewlinesTextRewriter = new NormalizeNewlinesTextRewriter({
    newlineKind: NewlineKind.Lf
  });
  const state: TextRewriterState = matcher.initialize();
  let result: string = '';

  for (let i = 0; i < input.length; ++i) {
    result += matcher.process(state, input[i]);
  }
  result += matcher.close(state);

  expect(result).toEqual(Text.convertToLf(input));
}

describe(NormalizeNewlinesTextRewriter.name, () => {
  it('should duplicate Text.convertToLf()', () => {
    testCase('');
    testCase('\n');
    testCase('\r');
    testCase('\n\n');
    testCase('\r\n');
    testCase('\n\r');
    testCase('\r\r');
    testCase('\n\n\n');
    testCase('\r\n\n');
    testCase('\n\r\n');
    testCase('\r\r\n');
    testCase('\n\n\r');
    testCase('\r\n\r');
    testCase('\n\r\r');
    testCase('\r\r\r');

    testCase('\nX\n\r');
    testCase('\rX\r');
    testCase('\r \n');
  });
});
