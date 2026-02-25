// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ITerminal } from '@rushstack/terminal';

import type { IScopedLogger } from './ScopedLogger.ts';

/**
 * Implementation of IScopedLogger for use by unit tests.
 *
 * @internal
 */
export class MockScopedLogger implements IScopedLogger {
  public errors: Error[] = [];
  public warnings: Error[] = [];

  public loggerName: string = 'mockLogger';

  public terminal: ITerminal;

  public constructor(terminal: ITerminal) {
    this.terminal = terminal;
  }
  public get hasErrors(): boolean {
    return this.errors.length > 0;
  }

  public emitError(error: Error): void {
    this.errors.push(error);
  }
  public emitWarning(warning: Error): void {
    this.warnings.push(warning);
  }

  public resetErrorsAndWarnings(): void {
    this.errors.length = 0;
    this.warnings.length = 0;
  }
}
