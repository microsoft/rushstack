// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Terminal } from '../Terminal';
import { StringBufferTerminalProvider } from '../StringBufferTerminalProvider';
import { createColorGrid } from './createColorGrid';
import { Colors } from '../Colors';

describe('Colors', () => {
  let terminal: Terminal;
  let provider: StringBufferTerminalProvider;

  beforeEach(() => {
    provider = new StringBufferTerminalProvider(true);
    terminal = new Terminal(provider);
  });

  test('writes color grid correctly', () => {
    for (const line of createColorGrid()) {
      terminal.writeLine(...line);
    }

    expect(provider.getOutput()).toMatchSnapshot();
  });

  test('correctly normalizes color codes for tests', () => {
    for (const line of createColorGrid()) {
      terminal.writeLine(...line);
    }

    expect(Colors.normalizeColorTokensForTest(provider.getOutput(false))).toMatchSnapshot();
  });
});
