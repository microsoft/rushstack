// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AnsiEscape } from '../AnsiEscape.ts';
import { Colorize } from '../Colorize.ts';

import { RemoveColorsTextRewriter } from '../RemoveColorsTextRewriter.ts';
import type { TextRewriterState } from '../TextRewriter.ts';

function testCase(inputs: string[]): void {
  const matcher: RemoveColorsTextRewriter = new RemoveColorsTextRewriter();
  const state: TextRewriterState = matcher.initialize();
  const outputs: string[] = inputs.map((x) => matcher.process(state, x));
  const closeOutput: string = matcher.close(state);
  if (closeOutput !== '') {
    outputs.push('--close--');
    outputs.push(closeOutput);
  }

  expect({
    inputs: inputs.map((x) => AnsiEscape.formatForTests(x)),
    outputs
  }).toMatchSnapshot();
}

describe(RemoveColorsTextRewriter.name, () => {
  it('01 should process empty inputs', () => {
    testCase([]);
    testCase(['']);
    testCase(['', 'a', '']);
  });

  it('02 should remove colors from complete chunks', () => {
    testCase([Colorize.red('1')]);
    testCase([Colorize.red('1') + Colorize.green('2')]);
    testCase([Colorize.red('1') + '2' + Colorize.green('3')]);
  });

  it('03 should remove colors from 1-character chunks', () => {
    const source: string = '1' + Colorize.red('2');
    const inputs: string[] = [];
    for (let i: number = 0; i < source.length; ++i) {
      inputs.push(source.substr(i, 1));
    }
    testCase(inputs);
  });

  it('04 should pass through incomplete partial matches', () => {
    testCase(['\x1b']);
    testCase(['\x1b[\n']);
    testCase(['\x1b[1']);
  });
});
