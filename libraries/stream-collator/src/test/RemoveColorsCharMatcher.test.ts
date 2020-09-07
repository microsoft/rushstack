// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';

import { RemoveColorsCharMatcher } from '../RemoveColorsCharMatcher';
import { CharMatcherState } from '../CharMatcher';
import { AnsiEscape } from '@rushstack/node-core-library';

function test(inputs: string[]): void {
  const matcher: RemoveColorsCharMatcher = new RemoveColorsCharMatcher();
  const state: CharMatcherState = matcher.initialize();
  const outputs: string[] = inputs.map((x) => matcher.process(state, x));
  const flush: string = matcher.flush(state);
  if (flush !== '') {
    outputs.push('--flush--');
    outputs.push(flush);
  }

  expect({
    inputs: inputs.map((x) => AnsiEscape.formatForTests(x)),
    outputs
  }).toMatchSnapshot();
}

describe('RemoveColorsCharMatcher', () => {
  let oldEnabled: boolean;

  beforeAll(() => {
    oldEnabled = colors.enabled;
    colors.enable();
  });

  afterAll(() => {
    if (!oldEnabled) {
      colors.disable();
    }
  });

  it('01 should process empty inputs', () => {
    test([]);
    test(['']);
    test(['', 'a', '']);
  });

  it('02 should remove colors from complete chunks', () => {
    test([colors.red('1')]);
    test([colors.red('1') + colors.green('2')]);
    test([colors.red('1') + '2' + colors.green('3')]);
  });

  it('03 should remove colors from 1-character chunks', () => {
    const source: string = '1' + colors.red('2');
    const inputs: string[] = [];
    for (let i: number = 0; i < source.length; ++i) {
      inputs.push(source.substr(i, 1));
    }
    test(inputs);
  });

  it('04 should pass through incomplete partial matches', () => {
    test(['\x1b']);
    test(['\x1b[\n']);
    test(['\x1b[1']);
  });
});
