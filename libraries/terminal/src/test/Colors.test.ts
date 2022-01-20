// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Terminal } from '../Terminal';
import { StringBufferTerminalProvider } from '../StringBufferTerminalProvider';
import { createColorGrid } from './createColorGrid';
import { Colors, type IColorableSequence } from '../Colors';

describe(Colors.name, () => {
  let terminal: Terminal;
  let provider: StringBufferTerminalProvider;

  beforeEach(() => {
    provider = new StringBufferTerminalProvider(true);
    terminal = new Terminal(provider);
  });

  test('writes color grid correctly', () => {
    let lineCount: number = 0;
    for (const line of createColorGrid()) {
      terminal.writeLine(...line);
      const output = provider.getOutput();
      expect(output).toMatchSnapshot(`line ${lineCount++}`);
    }

    expect(lineCount).toMatchInlineSnapshot(`10`);
  });

  it('generates codes as expected', () => {
    type ColorsFunctionNames = {
      [K in keyof typeof Colors]: (typeof Colors)[K] extends (str: string) => IColorableSequence ? K : never;
    }[keyof typeof Colors];
    function testColorFunction(functionName: ColorsFunctionNames): void {
      terminal.write(Colors[functionName]('x'));
      expect(provider.getOutput({ normalizeSpecialCharacters: false })).toMatchSnapshot(functionName);
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
