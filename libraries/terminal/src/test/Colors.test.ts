// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { createColorGrid } from './createColorGrid';
import { Colors } from '../Colors';
import { AnsiEscape } from '../AnsiEscape';

describe(Colors.name, () => {
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
      [K in keyof typeof Colors]: (typeof Colors)[K] extends (str: string) => string ? K : never;
    }[keyof typeof Colors];
    function testColorFunction(functionName: ColorsFunctionNames): void {
      expect(Colors[functionName]('x')).toMatchSnapshot(functionName);
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
