// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Terminal } from '../Terminal';
import { StringBufferTerminalProvider } from '../StringBufferTerminalProvider';
import { PrefixProxyTerminalProvider } from '../PrefixProxyTerminalProvider';

let terminal: Terminal;
let provider: StringBufferTerminalProvider;

function verifyProvider(): void {
  expect({
    log: provider.getOutput(),
    warning: provider.getWarningOutput(),
    error: provider.getErrorOutput(),
    verbose: provider.getVerbose(),
    debug: provider.getDebugOutput()
  }).toMatchSnapshot();
}

describe(PrefixProxyTerminalProvider.name, () => {
  beforeEach(() => {
    provider = new StringBufferTerminalProvider(true);
    const prefixProvider: PrefixProxyTerminalProvider = new PrefixProxyTerminalProvider({
      terminalProvider: provider,
      prefix: '[prefix] '
    });
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
      terminal.write(`message 1${provider.eolCharacter}message 2${provider.eolCharacter}message 3`);
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
      terminal.writeLine(`message 1${provider.eolCharacter}message 2${provider.eolCharacter}message 3`);
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
});
