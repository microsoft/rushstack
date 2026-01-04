// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Terminal } from '../Terminal';
import { StringBufferTerminalProvider } from '../StringBufferTerminalProvider';
import { Colorize } from '../Colorize';

describe(Terminal.name, () => {
  let terminal: Terminal;
  let provider: StringBufferTerminalProvider;

  function verifyProvider(): void {
    expect(provider.getAllOutput()).toMatchSnapshot('output');
    expect(provider.getAllOutputAsChunks({ asFlat: true })).toMatchSnapshot('output as chunks');
  }

  describe('01 color enabled', () => {
    beforeEach(() => {
      provider = new StringBufferTerminalProvider(true);
      terminal = new Terminal(provider);
    });

    describe('01 basic terminal functions', () => {
      describe('01 write', () => {
        it('01 writes a single message', () => {
          terminal.write('test message');
          verifyProvider();
        });

        it('02 writes multiple messages', () => {
          terminal.write('message 1', 'message 2');
          verifyProvider();
        });

        it('03 writes a message with colors', () => {
          terminal.write(Colorize.green('message 1'));
          verifyProvider();
        });

        it('04 writes a multiple messages with colors', () => {
          terminal.write(Colorize.green('message 1'), Colorize.red('message 2'));
          verifyProvider();
        });

        it('05 writes a messages with colors interspersed with non-colored messages', () => {
          terminal.write('message 1', Colorize.green('message 2'), 'message 3', Colorize.red('message 4'));
          verifyProvider();
        });

        it('06 writes a messages with colors interspersed with non-colored messages with color overriding disabled', () => {
          terminal.write('message 1', Colorize.green('message 2'), 'message 3', Colorize.red('message 4'), {
            doNotOverrideSgrCodes: true
          });
          verifyProvider();
        });
      });

      describe('02 writeLine', () => {
        it('01 writes a single message', () => {
          terminal.writeLine('test message');
          verifyProvider();
        });

        it('02 writes multiple messages', () => {
          terminal.writeLine('message 1', 'message 2');
          verifyProvider();
        });

        it('03 writes a message with colors', () => {
          terminal.writeLine(Colorize.green('message 1'));
          verifyProvider();
        });

        it('04 writes a multiple messages with colors', () => {
          terminal.writeLine(Colorize.green('message 1'), Colorize.red('message 2'));
          verifyProvider();
        });

        it('05 writes a messages with colors interspersed with non-colored messages', () => {
          terminal.writeLine(
            'message 1',
            Colorize.green('message 2'),
            'message 3',
            Colorize.red('message 4')
          );
          verifyProvider();
        });

        it('06 writes a messages with colors interspersed with non-colored messages with color overriding disabled', () => {
          terminal.writeLine(
            'message 1',
            Colorize.green('message 2'),
            'message 3',
            Colorize.red('message 4'),
            { doNotOverrideSgrCodes: true }
          );
          verifyProvider();
        });
      });

      describe('03 writeWarning', () => {
        it('01 writes a single message', () => {
          terminal.writeWarning('test message');
          verifyProvider();
        });

        it('02 writes multiple messages', () => {
          terminal.writeWarning('message 1', 'message 2');
          verifyProvider();
        });

        it('03 writes a message with colors', () => {
          terminal.writeWarning(Colorize.green('message 1'));
          verifyProvider();
        });

        it('04 writes a multiple messages with colors', () => {
          terminal.writeWarning(Colorize.green('message 1'), Colorize.red('message 2'));
          verifyProvider();
        });

        it('05 writes a messages with colors interspersed with non-colored messages', () => {
          terminal.writeWarning(
            'message 1',
            Colorize.green('message 2'),
            'message 3',
            Colorize.red('message 4')
          );
          verifyProvider();
        });

        it('06 writes a messages with colors interspersed with non-colored messages with color overriding disabled', () => {
          terminal.writeWarning(
            'message 1',
            Colorize.green('message 2'),
            'message 3',
            Colorize.red('message 4'),
            { doNotOverrideSgrCodes: true }
          );
          verifyProvider();
        });
      });

      describe('04 writeWarningLine', () => {
        it('01 writes a single message', () => {
          terminal.writeWarningLine('test message');
          verifyProvider();
        });

        it('02 writes multiple messages', () => {
          terminal.writeWarningLine('message 1', 'message 2');
          verifyProvider();
        });

        it('03 writes a message with colors', () => {
          terminal.writeWarningLine(Colorize.green('message 1'));
          verifyProvider();
        });

        it('04 writes a multiple messages with colors', () => {
          terminal.writeWarningLine(Colorize.green('message 1'), Colorize.red('message 2'));
          verifyProvider();
        });

        it('05 writes a messages with colors interspersed with non-colored messages', () => {
          terminal.writeWarningLine(
            'message 1',
            Colorize.green('message 2'),
            'message 3',
            Colorize.red('message 4')
          );
          verifyProvider();
        });

        it('06 writes a messages with colors interspersed with non-colored messages with color overriding disabled', () => {
          terminal.writeWarningLine(
            'message 1',
            Colorize.green('message 2'),
            'message 3',
            Colorize.red('message 4'),
            { doNotOverrideSgrCodes: true }
          );
          verifyProvider();
        });
      });

      describe('05 writeError', () => {
        it('01 writes a single message', () => {
          terminal.writeError('test message');
          verifyProvider();
        });

        it('02 writes multiple messages', () => {
          terminal.writeError('message 1', 'message 2');
          verifyProvider();
        });

        it('03 writes a message with colors', () => {
          terminal.writeError(Colorize.green('message 1'));
          verifyProvider();
        });

        it('04 writes a multiple messages with colors', () => {
          terminal.writeError(Colorize.green('message 1'), Colorize.red('message 2'));
          verifyProvider();
        });

        it('05 writes a messages with colors interspersed with non-colored messages', () => {
          terminal.writeError(
            'message 1',
            Colorize.green('message 2'),
            'message 3',
            Colorize.red('message 4')
          );
          verifyProvider();
        });

        it('06 writes a messages with colors interspersed with non-colored messages with color overriding disabled', () => {
          terminal.writeError(
            'message 1',
            Colorize.green('message 2'),
            'message 3',
            Colorize.red('message 4'),
            { doNotOverrideSgrCodes: true }
          );
          verifyProvider();
        });
      });

      describe('06 writeErrorLine', () => {
        it('01 writes a single message', () => {
          terminal.writeErrorLine('test message');
          verifyProvider();
        });

        it('02 writes multiple messages', () => {
          terminal.writeErrorLine('message 1', 'message 2');
          verifyProvider();
        });

        it('03 writes a message with colors', () => {
          terminal.writeErrorLine(Colorize.green('message 1'));
          verifyProvider();
        });

        it('04 writes a multiple messages with colors', () => {
          terminal.writeErrorLine(Colorize.green('message 1'), Colorize.red('message 2'));
          verifyProvider();
        });

        it('05 writes a messages with colors interspersed with non-colored messages', () => {
          terminal.writeErrorLine(
            'message 1',
            Colorize.green('message 2'),
            'message 3',
            Colorize.red('message 4')
          );
          verifyProvider();
        });

        it('06 writes a messages with colors interspersed with non-colored messages with color overriding disabled', () => {
          terminal.writeErrorLine(
            'message 1',
            Colorize.green('message 2'),
            'message 3',
            Colorize.red('message 4'),
            { doNotOverrideSgrCodes: true }
          );
          verifyProvider();
        });
      });

      describe('07 writeVerbose', () => {
        it('01 writes a single message', () => {
          terminal.writeVerbose('test message');
          verifyProvider();
        });

        it('02 writes multiple messages', () => {
          terminal.writeVerbose('message 1', 'message 2');
          verifyProvider();
        });

        it('03 writes a message with colors', () => {
          terminal.writeVerbose(Colorize.green('message 1'));
          verifyProvider();
        });

        it('04 writes a multiple messages with colors', () => {
          terminal.writeVerbose(Colorize.green('message 1'), Colorize.red('message 2'));
          verifyProvider();
        });

        it('05 writes a messages with colors interspersed with non-colored messages', () => {
          terminal.writeVerbose(
            'message 1',
            Colorize.green('message 2'),
            'message 3',
            Colorize.red('message 4')
          );
          verifyProvider();
        });

        it('06 writes a messages with colors interspersed with non-colored messages with color overriding disabled', () => {
          terminal.writeVerbose(
            'message 1',
            Colorize.green('message 2'),
            'message 3',
            Colorize.red('message 4'),
            { doNotOverrideSgrCodes: true }
          );
          verifyProvider();
        });
      });

      describe('08 writeVerboseLine', () => {
        it('01 writes a single message', () => {
          terminal.writeVerboseLine('test message');
          verifyProvider();
        });

        it('02 writes multiple messages', () => {
          terminal.writeVerboseLine('message 1', 'message 2');
          verifyProvider();
        });

        it('03 writes a message with colors', () => {
          terminal.writeVerboseLine(Colorize.green('message 1'));
          verifyProvider();
        });

        it('04 writes a multiple messages with colors', () => {
          terminal.writeVerboseLine(Colorize.green('message 1'), Colorize.red('message 2'));
          verifyProvider();
        });

        it('05 writes a messages with colors interspersed with non-colored messages', () => {
          terminal.writeVerboseLine(
            'message 1',
            Colorize.green('message 2'),
            'message 3',
            Colorize.red('message 4')
          );
          verifyProvider();
        });

        it('06 writes a messages with colors interspersed with non-colored messages with color overriding disabled', () => {
          terminal.writeVerboseLine(
            'message 1',
            Colorize.green('message 2'),
            'message 3',
            Colorize.red('message 4'),
            { doNotOverrideSgrCodes: true }
          );
          verifyProvider();
        });
      });
    });

    it('05 writes to multiple streams', () => {
      terminal.write('message 1', Colorize.green('message 2'), 'message 3', Colorize.red('message 4'));
      terminal.writeWarningLine('message 1', 'message 2');
      terminal.writeVerbose('test message');
      terminal.writeVerbose(Colorize.green('message 1'));
      terminal.writeLine(Colorize.green('message 1'));
      terminal.writeError('message 1', Colorize.green('message 2'), 'message 3', Colorize.red('message 4'));
      terminal.writeErrorLine('test message');
      terminal.writeVerboseLine(
        'message 1',
        Colorize.green('message 2'),
        'message 3',
        Colorize.red('message 4')
      );
      terminal.writeVerboseLine('test message');
      terminal.writeWarning(Colorize.green('message 1'), Colorize.red('message 2'));
      terminal.writeWarning('message 1', Colorize.green('message 2'), 'message 3', Colorize.red('message 4'));
      terminal.writeError('message 1', 'message 2');
      terminal.write(Colorize.green('message 1'));
      terminal.writeVerbose('message 1', Colorize.green('message 2'), 'message 3', Colorize.red('message 4'));
      terminal.writeErrorLine('message 1', 'message 2');
      terminal.write(Colorize.green('message 1'), Colorize.red('message 2'));
      terminal.writeVerbose('message 1', 'message 2');
      terminal.writeVerboseLine(Colorize.green('message 1'));
      terminal.writeLine(Colorize.green('message 1'), Colorize.red('message 2'));
      terminal.writeError(Colorize.green('message 1'));
      terminal.writeWarningLine(
        'message 1',
        Colorize.green('message 2'),
        'message 3',
        Colorize.red('message 4')
      );
      terminal.write('test message');
      terminal.writeWarningLine('test message');
      terminal.writeVerboseLine(Colorize.green('message 1'), Colorize.red('message 2'));
      terminal.writeVerboseLine('message 1', 'message 2');
      terminal.writeErrorLine(
        'message 1',
        Colorize.green('message 2'),
        'message 3',
        Colorize.red('message 4')
      );
      terminal.writeLine('message 1', Colorize.green('message 2'), 'message 3', Colorize.red('message 4'));
      terminal.writeWarning('message 1', 'message 2');
      terminal.writeErrorLine(Colorize.green('message 1'));
      terminal.write('message 1', 'message 2');
      terminal.writeVerbose(Colorize.green('message 1'), Colorize.red('message 2'));
      terminal.writeWarning(Colorize.green('message 1'));
      terminal.writeLine('test message');
      terminal.writeError('test message');
      terminal.writeLine('message 1', 'message 2');
      terminal.writeErrorLine(Colorize.green('message 1'), Colorize.red('message 2'));
      terminal.writeError(Colorize.green('message 1'), Colorize.red('message 2'));
      terminal.writeWarningLine(Colorize.green('message 1'), Colorize.red('message 2'));
      terminal.writeWarningLine(Colorize.green('message 1'));
      verifyProvider();
    });
  });

  describe('02 color disabled', () => {
    beforeEach(() => {
      provider = new StringBufferTerminalProvider(false);
      terminal = new Terminal(provider);
    });

    describe('01 basic terminal functions', () => {
      describe('01 write', () => {
        it('01 writes a single message', () => {
          terminal.write('test message');
          verifyProvider();
        });

        it('02 writes multiple messages', () => {
          terminal.write('message 1', 'message 2');
          verifyProvider();
        });

        it('03 writes a message with colors', () => {
          terminal.write(Colorize.green('message 1'));
          verifyProvider();
        });

        it('04 writes a multiple messages with colors', () => {
          terminal.write(Colorize.green('message 1'), Colorize.red('message 2'));
          verifyProvider();
        });

        it('05 writes a messages with colors interspersed with non-colored messages', () => {
          terminal.write('message 1', Colorize.green('message 2'), 'message 3', Colorize.red('message 4'));
          verifyProvider();
        });

        it('06 writes a messages with colors interspersed with non-colored messages with color overriding disabled', () => {
          terminal.write('message 1', Colorize.green('message 2'), 'message 3', Colorize.red('message 4'), {
            doNotOverrideSgrCodes: true
          });
          verifyProvider();
        });
      });

      describe('02 writeLine', () => {
        it('01 writes a single message', () => {
          terminal.writeLine('test message');
          verifyProvider();
        });

        it('02 writes multiple messages', () => {
          terminal.writeLine('message 1', 'message 2');
          verifyProvider();
        });

        it('03 writes a message with colors', () => {
          terminal.writeLine(Colorize.green('message 1'));
          verifyProvider();
        });

        it('04 writes a multiple messages with colors', () => {
          terminal.writeLine(Colorize.green('message 1'), Colorize.red('message 2'));
          verifyProvider();
        });

        it('05 writes a messages with colors interspersed with non-colored messages', () => {
          terminal.writeLine(
            'message 1',
            Colorize.green('message 2'),
            'message 3',
            Colorize.red('message 4')
          );
          verifyProvider();
        });

        it('06 writes a messages with colors interspersed with non-colored messages with color overriding disabled', () => {
          terminal.writeLine(
            'message 1',
            Colorize.green('message 2'),
            'message 3',
            Colorize.red('message 4'),
            { doNotOverrideSgrCodes: true }
          );
          verifyProvider();
        });
      });

      describe('03 writeWarning', () => {
        it('01 writes a single message', () => {
          terminal.writeWarning('test message');
          verifyProvider();
        });

        it('02 writes multiple messages', () => {
          terminal.writeWarning('message 1', 'message 2');
          verifyProvider();
        });

        it('03 writes a message with colors', () => {
          terminal.writeWarning(Colorize.green('message 1'));
          verifyProvider();
        });

        it('04 writes a multiple messages with colors', () => {
          terminal.writeWarning(Colorize.green('message 1'), Colorize.red('message 2'));
          verifyProvider();
        });

        it('05 writes a messages with colors interspersed with non-colored messages', () => {
          terminal.writeWarning(
            'message 1',
            Colorize.green('message 2'),
            'message 3',
            Colorize.red('message 4')
          );
          verifyProvider();
        });

        it('06 writes a messages with colors interspersed with non-colored messages with color overriding disabled', () => {
          terminal.writeWarning(
            'message 1',
            Colorize.green('message 2'),
            'message 3',
            Colorize.red('message 4'),
            { doNotOverrideSgrCodes: true }
          );
          verifyProvider();
        });
      });

      describe('04 writeWarningLine', () => {
        it('01 writes a single message', () => {
          terminal.writeWarningLine('test message');
          verifyProvider();
        });

        it('02 writes multiple messages', () => {
          terminal.writeWarningLine('message 1', 'message 2');
          verifyProvider();
        });

        it('03 writes a message with colors', () => {
          terminal.writeWarningLine(Colorize.green('message 1'));
          verifyProvider();
        });

        it('04 writes a multiple messages with colors', () => {
          terminal.writeWarningLine(Colorize.green('message 1'), Colorize.red('message 2'));
          verifyProvider();
        });

        it('05 writes a messages with colors interspersed with non-colored messages', () => {
          terminal.writeWarningLine(
            'message 1',
            Colorize.green('message 2'),
            'message 3',
            Colorize.red('message 4')
          );
          verifyProvider();
        });

        it('06 writes a messages with colors interspersed with non-colored messages with color overriding disabled', () => {
          terminal.writeWarningLine(
            'message 1',
            Colorize.green('message 2'),
            'message 3',
            Colorize.red('message 4'),
            { doNotOverrideSgrCodes: true }
          );
          verifyProvider();
        });
      });

      describe('05 writeError', () => {
        it('01 writes a single message', () => {
          terminal.writeError('test message');
          verifyProvider();
        });

        it('02 writes multiple messages', () => {
          terminal.writeError('message 1', 'message 2');
          verifyProvider();
        });

        it('03 writes a message with colors', () => {
          terminal.writeError(Colorize.green('message 1'));
          verifyProvider();
        });

        it('04 writes a multiple messages with colors', () => {
          terminal.writeError(Colorize.green('message 1'), Colorize.red('message 2'));
          verifyProvider();
        });

        it('05 writes a messages with colors interspersed with non-colored messages', () => {
          terminal.writeError(
            'message 1',
            Colorize.green('message 2'),
            'message 3',
            Colorize.red('message 4')
          );
          verifyProvider();
        });

        it('06 writes a messages with colors interspersed with non-colored messages with color overriding disabled', () => {
          terminal.writeError(
            'message 1',
            Colorize.green('message 2'),
            'message 3',
            Colorize.red('message 4'),
            { doNotOverrideSgrCodes: true }
          );
          verifyProvider();
        });
      });

      describe('06 writeErrorLine', () => {
        it('01 writes a single message', () => {
          terminal.writeErrorLine('test message');
          verifyProvider();
        });

        it('02 writes multiple messages', () => {
          terminal.writeErrorLine('message 1', 'message 2');
          verifyProvider();
        });

        it('03 writes a message with colors', () => {
          terminal.writeErrorLine(Colorize.green('message 1'));
          verifyProvider();
        });

        it('04 writes a multiple messages with colors', () => {
          terminal.writeErrorLine(Colorize.green('message 1'), Colorize.red('message 2'));
          verifyProvider();
        });

        it('05 writes a messages with colors interspersed with non-colored messages', () => {
          terminal.writeErrorLine(
            'message 1',
            Colorize.green('message 2'),
            'message 3',
            Colorize.red('message 4')
          );
          verifyProvider();
        });

        it('06 writes a messages with colors interspersed with non-colored messages with color overriding disabled', () => {
          terminal.writeErrorLine(
            'message 1',
            Colorize.green('message 2'),
            'message 3',
            Colorize.red('message 4'),
            { doNotOverrideSgrCodes: true }
          );
          verifyProvider();
        });
      });

      describe('07 writeVerbose', () => {
        it('01 writes a single message', () => {
          terminal.writeVerbose('test message');
          verifyProvider();
        });

        it('02 writes multiple messages', () => {
          terminal.writeVerbose('message 1', 'message 2');
          verifyProvider();
        });

        it('03 writes a message with colors', () => {
          terminal.writeVerbose(Colorize.green('message 1'));
          verifyProvider();
        });

        it('04 writes a multiple messages with colors', () => {
          terminal.writeVerbose(Colorize.green('message 1'), Colorize.red('message 2'));
          verifyProvider();
        });

        it('05 writes a messages with colors interspersed with non-colored messages', () => {
          terminal.writeVerbose(
            'message 1',
            Colorize.green('message 2'),
            'message 3',
            Colorize.red('message 4')
          );
          verifyProvider();
        });

        it('06 writes a messages with colors interspersed with non-colored messages with color overriding disabled', () => {
          terminal.writeVerbose(
            'message 1',
            Colorize.green('message 2'),
            'message 3',
            Colorize.red('message 4'),
            { doNotOverrideSgrCodes: true }
          );
          verifyProvider();
        });
      });

      describe('08 writeVerboseLine', () => {
        it('01 writes a single message', () => {
          terminal.writeVerboseLine('test message');
          verifyProvider();
        });

        it('02 writes multiple messages', () => {
          terminal.writeVerboseLine('message 1', 'message 2');
          verifyProvider();
        });

        it('03 writes a message with colors', () => {
          terminal.writeVerboseLine(Colorize.green('message 1'));
          verifyProvider();
        });

        it('04 writes a multiple messages with colors', () => {
          terminal.writeVerboseLine(Colorize.green('message 1'), Colorize.red('message 2'));
          verifyProvider();
        });

        it('05 writes a messages with colors interspersed with non-colored messages', () => {
          terminal.writeVerboseLine(
            'message 1',
            Colorize.green('message 2'),
            'message 3',
            Colorize.red('message 4')
          );
          verifyProvider();
        });

        it('06 writes a messages with colors interspersed with non-colored messages with color overriding disabled', () => {
          terminal.writeVerboseLine(
            'message 1',
            Colorize.green('message 2'),
            'message 3',
            Colorize.red('message 4'),
            { doNotOverrideSgrCodes: true }
          );
          verifyProvider();
        });
      });

      describe('09 writeDebug', () => {
        it('01 writes a single message', () => {
          terminal.writeDebug('test message');
          verifyProvider();
        });

        it('02 writes multiple messages', () => {
          terminal.writeDebug('message 1', 'message 2');
          verifyProvider();
        });

        it('03 writes a message with colors', () => {
          terminal.writeDebug(Colorize.green('message 1'));
          verifyProvider();
        });

        it('04 writes a multiple messages with colors', () => {
          terminal.writeDebug(Colorize.green('message 1'), Colorize.red('message 2'));
          verifyProvider();
        });

        it('05 writes a messages with colors interspersed with non-colored messages', () => {
          terminal.writeDebug(
            'message 1',
            Colorize.green('message 2'),
            'message 3',
            Colorize.red('message 4')
          );
          verifyProvider();
        });

        it('06 writes a messages with colors interspersed with non-colored messages with color overriding disabled', () => {
          terminal.writeDebug(
            'message 1',
            Colorize.green('message 2'),
            'message 3',
            Colorize.red('message 4'),
            { doNotOverrideSgrCodes: true }
          );
          verifyProvider();
        });
      });

      describe('10 writeDebugLine', () => {
        it('01 writes a single message', () => {
          terminal.writeDebugLine('test message');
          verifyProvider();
        });

        it('02 writes multiple messages', () => {
          terminal.writeDebugLine('message 1', 'message 2');
          verifyProvider();
        });

        it('03 writes a message with colors', () => {
          terminal.writeDebugLine(Colorize.green('message 1'));
          verifyProvider();
        });

        it('04 writes a multiple messages with colors', () => {
          terminal.writeDebugLine(Colorize.green('message 1'), Colorize.red('message 2'));
          verifyProvider();
        });

        it('05 writes a messages with colors interspersed with non-colored messages', () => {
          terminal.writeDebugLine(
            'message 1',
            Colorize.green('message 2'),
            'message 3',
            Colorize.red('message 4')
          );
          verifyProvider();
        });

        it('06 writes a messages with colors interspersed with non-colored messages with color overriding disabled', () => {
          terminal.writeDebugLine(
            'message 1',
            Colorize.green('message 2'),
            'message 3',
            Colorize.red('message 4'),
            { doNotOverrideSgrCodes: true }
          );
          verifyProvider();
        });
      });
    });

    it('05 writes to multiple streams', () => {
      terminal.write('message 1', Colorize.green('message 2'), 'message 3', Colorize.red('message 4'));
      terminal.writeWarningLine('message 1', 'message 2');
      terminal.writeVerbose('test message');
      terminal.writeVerbose(Colorize.green('message 1'));
      terminal.writeLine(Colorize.green('message 1'));
      terminal.writeError('message 1', Colorize.green('message 2'), 'message 3', Colorize.red('message 4'));
      terminal.writeErrorLine('test message');
      terminal.writeVerboseLine(
        'message 1',
        Colorize.green('message 2'),
        'message 3',
        Colorize.red('message 4')
      );
      terminal.writeVerboseLine('test message');
      terminal.writeWarning(Colorize.green('message 1'), Colorize.red('message 2'));
      terminal.writeWarning('message 1', Colorize.green('message 2'), 'message 3', Colorize.red('message 4'));
      terminal.writeError('message 1', 'message 2');
      terminal.write(Colorize.green('message 1'));
      terminal.writeVerbose('message 1', Colorize.green('message 2'), 'message 3', Colorize.red('message 4'));
      terminal.writeErrorLine('message 1', 'message 2');
      terminal.write(Colorize.green('message 1'), Colorize.red('message 2'));
      terminal.writeVerbose('message 1', 'message 2');
      terminal.writeVerboseLine(Colorize.green('message 1'));
      terminal.writeLine(Colorize.green('message 1'), Colorize.red('message 2'));
      terminal.writeError(Colorize.green('message 1'));
      terminal.writeWarningLine(
        'message 1',
        Colorize.green('message 2'),
        'message 3',
        Colorize.red('message 4')
      );
      terminal.write('test message');
      terminal.writeWarningLine('test message');
      terminal.writeVerboseLine(Colorize.green('message 1'), Colorize.red('message 2'));
      terminal.writeVerboseLine('message 1', 'message 2');
      terminal.writeErrorLine(
        'message 1',
        Colorize.green('message 2'),
        'message 3',
        Colorize.red('message 4')
      );
      terminal.writeLine('message 1', Colorize.green('message 2'), 'message 3', Colorize.red('message 4'));
      terminal.writeWarning('message 1', 'message 2');
      terminal.writeErrorLine(Colorize.green('message 1'));
      terminal.write('message 1', 'message 2');
      terminal.writeVerbose(Colorize.green('message 1'), Colorize.red('message 2'));
      terminal.writeWarning(Colorize.green('message 1'));
      terminal.writeLine('test message');
      terminal.writeError('test message');
      terminal.writeLine('message 1', 'message 2');
      terminal.writeErrorLine(Colorize.green('message 1'), Colorize.red('message 2'));
      terminal.writeError(Colorize.green('message 1'), Colorize.red('message 2'));
      terminal.writeWarningLine(Colorize.green('message 1'), Colorize.red('message 2'));
      terminal.writeWarningLine(Colorize.green('message 1'));
      verifyProvider();
    });
  });
});
