// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Tokenizer, TokenKind } from '../Tokenizer';

function escape(s: string): string {
  return s.replace(/\n/g, '[n]')
    .replace(/\r/g, '[r]')
    .replace(/\t/g, '[t]');
}

function matchSnapshot(input: string): void {
  const tokenizer = new Tokenizer(input);
  expect({
    input: escape(tokenizer.input.toString()),
    tokens: tokenizer.getTokens().map(x => [TokenKind[x.kind], escape(x.toString())])
  }).toMatchSnapshot();
}

test('empty inputs', () => {
  matchSnapshot('');
  matchSnapshot('\r\n');
});

test('white space tokens', () => {
  matchSnapshot('  abc   \r\ndef  \n  ghi\n\r  ');
});
