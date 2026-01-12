// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Terminal } from '../Terminal';
import { StringBufferTerminalProvider } from '../StringBufferTerminalProvider';
import { PrefixProxyTerminalProvider } from '../PrefixProxyTerminalProvider';
import type { ITerminalProvider } from '../ITerminalProvider';

function runTestsForTerminalProvider(
  getTerminalProvider: (terminalProvider: ITerminalProvider) => PrefixProxyTerminalProvider
): void {
  let terminal: Terminal;
  let baseProvider: StringBufferTerminalProvider;

  function verifyProvider(): void {
    expect(baseProvider.getAllOutput(true)).toMatchSnapshot('output');
    expect(baseProvider.getAllOutputAsChunks({ asLines: true })).toMatchSnapshot('output as chunks');
  }

  beforeEach(() => {
    baseProvider = new StringBufferTerminalProvider(true);
    const prefixProvider: PrefixProxyTerminalProvider = getTerminalProvider(baseProvider);
    terminal = new Terminal(prefixProvider);
  });

  describe('write', () => {
    test('writes a message', () => {
      terminal.write('test message');
      verifyProvider();
    });

    test('writes a message with newlines', () => {
      terminal.write('message 1\nmessage 2\nmessage 3');
      verifyProvider();
    });

    test('writes a message with provider newlines', () => {
      terminal.write(`message 1${baseProvider.eolCharacter}message 2${baseProvider.eolCharacter}message 3`);
      verifyProvider();
    });

    test('writes messages without newlines', () => {
      terminal.write('message 1');
      terminal.write('message 2');
      terminal.write('message 3');
      verifyProvider();
    });

    test('writes a mix of messages with and without newlines', () => {
      terminal.write('message 1');
      terminal.write('message 2\nmessage 3\n');
      terminal.write('message 4');
      terminal.write('message 5\nmessage 6');
      verifyProvider();
    });
  });

  describe('writeLine', () => {
    test('writes a message line', () => {
      terminal.writeLine('test message');
      verifyProvider();
    });

    test('writes a message line with newlines', () => {
      terminal.writeLine('message 1\nmessage 2\nmessage 3');
      verifyProvider();
    });

    test('writes a message line with provider newlines', () => {
      terminal.writeLine(
        `message 1${baseProvider.eolCharacter}message 2${baseProvider.eolCharacter}message 3`
      );
      verifyProvider();
    });

    test('writes a mix of message lines with and without newlines', () => {
      terminal.writeLine('message 1');
      terminal.writeLine('message 2\nmessage 3\n');
      terminal.writeLine('message 4');
      terminal.writeLine('message 5\nmessage 6');
      verifyProvider();
    });
  });
}

describe(PrefixProxyTerminalProvider.name, () => {
  describe('With a static prefix', () => {
    runTestsForTerminalProvider(
      (terminalProvider) =>
        new PrefixProxyTerminalProvider({
          terminalProvider,
          prefix: '[prefix] '
        })
    );
  });

  describe('With a dynamic prefix', () => {
    runTestsForTerminalProvider((terminalProvider) => {
      let counter: number = 0;
      return new PrefixProxyTerminalProvider({
        terminalProvider,
        getPrefix: () => `[prefix (${counter++})] `
      });
    });
  });
});
