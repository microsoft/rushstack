// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';

import { MockScopedLogger } from '../MockScopedLogger';

// MockScopedLogger is deep-imported by plugin test suites ("@rushstack/heft/lib/pluginFramework/logging/MockScopedLogger"),
// so its observable behavior is part of Heft's de-facto public surface.
describe(MockScopedLogger.name, () => {
  it('records errors and warnings without writing to the terminal', () => {
    const terminalProvider: StringBufferTerminalProvider = new StringBufferTerminalProvider();
    const logger: MockScopedLogger = new MockScopedLogger(new Terminal(terminalProvider));

    expect(logger.loggerName).toBe('mockLogger');
    expect(logger.hasErrors).toBe(false);

    const error: Error = new Error('an error');
    const warning: Error = new Error('a warning');
    logger.emitError(error);
    logger.emitWarning(warning);

    expect(logger.hasErrors).toBe(true);
    expect(logger.errors).toEqual([error]);
    expect(logger.warnings).toEqual([warning]);
    expect(terminalProvider.getOutput()).toBe('');
    expect(terminalProvider.getErrorOutput()).toBe('');
  });

  it('resets errors and warnings in place', () => {
    const logger: MockScopedLogger = new MockScopedLogger(new Terminal(new StringBufferTerminalProvider()));
    const errors: Error[] = logger.errors;
    const warnings: Error[] = logger.warnings;
    logger.emitError(new Error('e'));
    logger.emitWarning(new Error('w'));

    logger.resetErrorsAndWarnings();

    expect(logger.hasErrors).toBe(false);
    expect(logger.errors).toBe(errors);
    expect(logger.warnings).toBe(warnings);
    expect(errors).toHaveLength(0);
    expect(warnings).toHaveLength(0);
  });

  it('exposes the provided terminal', () => {
    const terminalProvider: StringBufferTerminalProvider = new StringBufferTerminalProvider();
    const terminal: Terminal = new Terminal(terminalProvider);
    const logger: MockScopedLogger = new MockScopedLogger(terminal);

    logger.terminal.writeLine('hello');

    expect(logger.terminal).toBe(terminal);
    expect(terminalProvider.getOutput()).toBe('hello[n]');
  });
});
