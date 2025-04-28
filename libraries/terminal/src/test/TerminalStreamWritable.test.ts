// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Terminal } from '../Terminal';
import { StringBufferTerminalProvider } from '../StringBufferTerminalProvider';
import { TerminalStreamWritable } from '../TerminalStreamWritable';
import { TerminalProviderSeverity } from '../ITerminalProvider';
import type { Writable } from 'stream';

let terminal: Terminal;
let provider: StringBufferTerminalProvider;

function verifyProvider(): void {
  expect({
    log: provider.getOutput(),
    warning: provider.getWarningOutput(),
    error: provider.getErrorOutput(),
    verbose: provider.getVerboseOutput(),
    debug: provider.getDebugOutput()
  }).toMatchSnapshot();
}

async function writeAsync(writable: Writable, data: string): Promise<void> {
  await new Promise<void>((resolve: () => void, reject: (error: Error) => void) => {
    // eslint-disable-next-line @rushstack/no-new-null
    writable.write(data, (error?: Error | null) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

describe(TerminalStreamWritable.name, () => {
  beforeEach(() => {
    provider = new StringBufferTerminalProvider(true);
    terminal = new Terminal(provider);
  });

  test('writes a message', async () => {
    const writable: TerminalStreamWritable = new TerminalStreamWritable({
      terminal,
      severity: TerminalProviderSeverity.log
    });

    await writeAsync(writable, 'test message');
    verifyProvider();
  });

  test('writes a verbose message', async () => {
    const writable: TerminalStreamWritable = new TerminalStreamWritable({
      terminal,
      severity: TerminalProviderSeverity.verbose
    });

    await writeAsync(writable, 'test message');
    verifyProvider();
  });

  test('writes a debug message', async () => {
    const writable: TerminalStreamWritable = new TerminalStreamWritable({
      terminal,
      severity: TerminalProviderSeverity.debug
    });

    await writeAsync(writable, 'test message');
    verifyProvider();
  });

  test('writes a warning message', async () => {
    const writable: TerminalStreamWritable = new TerminalStreamWritable({
      terminal,
      severity: TerminalProviderSeverity.warning
    });

    await writeAsync(writable, 'test message');
    verifyProvider();
  });

  test('writes an error message', async () => {
    const writable: TerminalStreamWritable = new TerminalStreamWritable({
      terminal,
      severity: TerminalProviderSeverity.error
    });

    await writeAsync(writable, 'test message');
    verifyProvider();
  });
});
