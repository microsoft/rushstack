// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  PrefixProxyTerminalProvider,
  Terminal,
  type ITerminalProvider,
  type ITerminal
} from '@rushstack/terminal';

import { LoggingManager } from './LoggingManager';

/**
 * A logger which is used to emit errors and warnings to the console, as well as to write
 * to the console. Messaged emitted by the scoped logger are prefixed with the name of the
 * scoped logger.
 *
 * @public
 */
export interface IScopedLogger {
  /**
   * The name of the scoped logger. Logging messages will be prefixed with this name.
   */
  readonly loggerName: string;
  /**
   * The terminal used to write messages to the console.
   */
  readonly terminal: ITerminal;

  /**
   * Indicates if the logger has emitted any errors.
   */
  readonly hasErrors: boolean;

  /**
   * Call this function to emit an error to the heft runtime.
   */
  emitError(error: Error): void;

  /**
   * Call this function to emit an warning to the heft runtime.
   */
  emitWarning(warning: Error): void;

  /**
   * Reset the errors and warnings for this scoped logger.
   */
  resetErrorsAndWarnings(): void;
}

export interface IScopedLoggerOptions {
  loggerName: string;
  terminalProvider: ITerminalProvider;
  getShouldPrintStacks: () => boolean;
  errorHasBeenEmittedCallback: () => void;
  warningHasBeenEmittedCallback: () => void;
}

export class ScopedLogger implements IScopedLogger {
  readonly #options: IScopedLoggerOptions;
  #errors: Error[] = [];
  #warnings: Error[] = [];

  get #shouldPrintStacks(): boolean {
    // TODO: Consider dumping stacks and more verbose logging to a file
    return this.#options.getShouldPrintStacks();
  }

  public get errors(): ReadonlyArray<Error> {
    return [...this.#errors];
  }

  public get warnings(): ReadonlyArray<Error> {
    return [...this.#warnings];
  }

  public readonly loggerName: string;

  public readonly terminalProvider: ITerminalProvider;

  public readonly terminal: ITerminal;

  /**
   * @internal
   */
  public constructor(options: IScopedLoggerOptions) {
    this.#options = options;
    this.loggerName = options.loggerName;

    this.terminalProvider = new PrefixProxyTerminalProvider({
      terminalProvider: options.terminalProvider,
      prefix: `[${this.loggerName}] `
    });
    this.terminal = new Terminal(this.terminalProvider);
  }

  /**
   * {@inheritdoc IScopedLogger.hasErrors}
   */
  public get hasErrors(): boolean {
    return this.#errors.length > 0;
  }

  /**
   * {@inheritdoc IScopedLogger.emitError}
   */
  public emitError(error: Error): void {
    this.#options.errorHasBeenEmittedCallback();
    this.#errors.push(error);
    this.terminal.writeErrorLine(`Error: ${LoggingManager.getErrorMessage(error)}`);
    if (this.#shouldPrintStacks && error.stack) {
      this.terminal.writeErrorLine(error.stack);
    }
  }

  /**
   * {@inheritdoc IScopedLogger.emitWarning}
   */
  public emitWarning(warning: Error): void {
    this.#options.warningHasBeenEmittedCallback();
    this.#warnings.push(warning);
    this.terminal.writeWarningLine(`Warning: ${LoggingManager.getErrorMessage(warning)}`);
    if (this.#shouldPrintStacks && warning.stack) {
      this.terminal.writeWarningLine(warning.stack);
    }
  }

  /**
   * {@inheritdoc IScopedLogger.resetErrorsAndWarnings}
   */
  public resetErrorsAndWarnings(): void {
    this.#errors = [];
    this.#warnings = [];
  }
}
