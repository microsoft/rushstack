// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { createColorGrid } from './createColorGrid.ts';
import { Colorize } from '../Colorize.ts';
import { AnsiEscape } from '../AnsiEscape.ts';

describe(Colorize.name, () => {
  test('writes color grid correctly', () => {
    let lineCount: number = 0;
    for (const line of createColorGrid()) {
      expect(line.map((linePart) => AnsiEscape.formatForTests(linePart))).toMatchSnapshot(
        `line ${lineCount++}`
      );
    }

    expect(lineCount).toMatchInlineSnapshot(`10`);
  });

  it('generates codes as expected', () => {
    type ColorsFunctionNames = {
      [K in keyof typeof Colorize]: (typeof Colorize)[K] extends (str: string) => string ? K : never;
    }[keyof typeof Colorize];
    function testColorFunction(functionName: ColorsFunctionNames): void {
      expect(Colorize[functionName]('x')).toMatchSnapshot(functionName);
    }

    testColorFunction('black');
    testColorFunction('red');
    testColorFunction('green');
    testColorFunction('yellow');
    testColorFunction('blue');
    testColorFunction('magenta');
    testColorFunction('cyan');
    testColorFunction('white');
    testColorFunction('gray');
    testColorFunction('blackBackground');
    testColorFunction('redBackground');
    testColorFunction('greenBackground');
    testColorFunction('yellowBackground');
    testColorFunction('blueBackground');
    testColorFunction('magentaBackground');
    testColorFunction('cyanBackground');
    testColorFunction('whiteBackground');
    testColorFunction('grayBackground');
    testColorFunction('bold');
    testColorFunction('dim');
    testColorFunction('underline');
    testColorFunction('blink');
    testColorFunction('invertColor');
    testColorFunction('hidden');
  });
});
