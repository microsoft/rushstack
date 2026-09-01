// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { type ITerminalProvider, Terminal } from '@rushstack/terminal';

/**
 * @beta
 */
export interface ILogger {
  readonly terminal: Terminal;

  /**
   * Call this function to emit an error to the Rush runtime.
   */
  emitError(error: Error): void;

  /**
   * Call this function to emit a warning to the Rush runtime.
   */
  emitWarning(warning: Error): void;
}

export interface ILoggerOptions {
  loggerName: string;
  terminalProvider: ITerminalProvider;
  getShouldPrintStacks: () => boolean;
}

export class Logger implements ILogger {
  readonly #options: ILoggerOptions;
  readonly #errors: Error[] = [];
  readonly #warnings: Error[] = [];

  public readonly terminal: Terminal;

  public constructor(options: ILoggerOptions) {
    this.#options = options;
    this.terminal = new Terminal(options.terminalProvider);
  }

  public get errors(): ReadonlyArray<Error> {
    return [...this.errors];
  }

  public get warnings(): ReadonlyArray<Error> {
    return [...this.warnings];
  }

  public static getErrorMessage(error: Error): string {
    return error.message;
  }

  /**
   * {@inheritdoc ILogger.emitError}
   */
  public emitError(error: Error): void {
    this.#errors.push(error);
    this.terminal.writeErrorLine(`Error: ${Logger.getErrorMessage(error)}`);
    if (this.#shouldPrintStacks && error.stack) {
      this.terminal.writeErrorLine(error.stack);
    }
  }

  /**
   * {@inheritdoc ILogger.emitWarning}
   */
  public emitWarning(warning: Error): void {
    this.#warnings.push(warning);
    this.terminal.writeWarningLine(`Warning: ${Logger.getErrorMessage(warning)}`);
    if (this.#shouldPrintStacks && warning.stack) {
      this.terminal.writeWarningLine(warning.stack);
    }
  }

  get #shouldPrintStacks(): boolean {
    return this.#options.getShouldPrintStacks();
  }
}
