// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Tokenizer, TokenKind, type Token } from '../Tokenizer.ts';

function escape(s: string): string {
  return s.replace(/\n/g, '[n]').replace(/\r/g, '[r]').replace(/\t/g, '[t]').replace(/\\/g, '[b]');
}

function tokenize(input: string): Token[] {
  const tokenizer: Tokenizer = new Tokenizer(input);
  return tokenizer.readTokens();
}

function matchSnapshot(input: string): void {
  const tokenizer: Tokenizer = new Tokenizer(input);

  const reportedTokens: { kind: string; value: string }[] = tokenizer.readTokens().map((token) => {
    return {
      kind: TokenKind[token.kind],
      value: escape(token.toString())
    };
  });

  expect({
    input: escape(tokenizer.input.toString()),
    tokens: reportedTokens
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
  expect(() => tokenize('Unterminated: \\')).toThrowError();
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

test('05: double-quoted strings', () => {
  matchSnapshot('what "is" is');
  matchSnapshot('what"is"is');
  matchSnapshot('what"is\\""is');
  matchSnapshot('no C-style escapes: "\\t\\r\\n"');
  expect(() => tokenize('Unterminated: "')).toThrowError();
  expect(() => tokenize('Unterminated: "abc')).toThrowError();
  expect(() => tokenize('Unterminated: "abc\\')).toThrowError();
});
