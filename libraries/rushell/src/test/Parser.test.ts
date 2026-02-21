// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Tokenizer } from '../Tokenizer.ts';
import { Parser } from '../Parser.ts';
import type { AstScript } from '../AstNode.ts';

function escape(s: string): string {
  return s.replace(/\n/g, '[n]').replace(/\r/g, '[r]').replace(/\t/g, '[t]').replace(/\\/g, '[b]');
}

function matchSnapshot(input: string): void {
  const tokenizer: Tokenizer = new Tokenizer(input);
  const parser: Parser = new Parser(tokenizer);
  const result: AstScript = parser.parse();
  expect({
    input: escape(tokenizer.input.toString()),
    tree: '\n' + result.getDump()
  }).toMatchSnapshot();
}

function matchErrorSnapshot(input: string): void {
  const tokenizer: Tokenizer = new Tokenizer(input);
  const parser: Parser = new Parser(tokenizer);
  let error: Error | undefined = undefined;
  try {
    parser.parse();
  } catch (e) {
    error = e as Error;
  }
  expect({
    input: escape(tokenizer.input.toString()),
    reportedError: error
  }).toMatchSnapshot();
}

test('00: basic inputs', () => {
  matchSnapshot('command arg1 arg2');
});

test('01: basic errors', () => {
  matchErrorSnapshot('@bad');
  matchErrorSnapshot('command @bad');
});
