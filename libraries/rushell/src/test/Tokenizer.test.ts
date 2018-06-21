// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Tokenizer, TokenKind, Token } from '../Tokenizer';

function escape(s: string): string {
  return s.replace(/\n/g, '[n]')
    .replace(/\r/g, '[r]')
    .replace(/\t/g, '[t]')
    .replace(/\\/g, '[b]');
}

function tokenize(input: string): Token[] {
  const tokenizer: Tokenizer = new Tokenizer(input);
  return tokenizer.getTokens();
}

function matchSnapshot(input: string): void {
  const tokenizer: Tokenizer = new Tokenizer(input);
  expect({
    input: escape(tokenizer.input.toString()),
    tokens: tokenizer.getTokens().map(x => [TokenKind[x.kind], escape(x.toString())])
  }).toMatchSnapshot();
}

test('00: empty inputs', () => {
  matchSnapshot('');
  matchSnapshot('\r\n');
});

test('01: white space tokens', () => {
  matchSnapshot(' \t abc   \r\ndef  \n  ghi\n\r  ');
});

test('02: text with escapes', () => {
  matchSnapshot(' ab+56\\>qrst(abc\\))');
});

test('03: The && operator', () => {
  matchSnapshot('&&abc&&cde&&');
  matchSnapshot('a&b');
  matchSnapshot('&&');
  matchSnapshot('&');
});

test('04: dollar variables', () => {
  matchSnapshot('$abc123.456');
  matchSnapshot('$ab$_90');
  expect(() => tokenize('$')).toThrowError();
  expect(() => tokenize('${abc}')).toThrowError();
});
