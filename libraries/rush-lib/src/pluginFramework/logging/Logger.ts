import { ITerminalProvider, Terminal } from '@rushstack/node-core-library';

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
  private readonly _options: ILoggerOptions;
  private readonly _errors: Error[] = [];
  private readonly _warnings: Error[] = [];

  public readonly terminal: Terminal;

  public constructor(options: ILoggerOptions) {
    this._options = options;
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
    this._errors.push(error);
    this.terminal.writeErrorLine(`Error: ${Logger.getErrorMessage(error)}`);
    if (this._shouldPrintStacks && error.stack) {
      this.terminal.writeErrorLine(error.stack);
    }
  }

  /**
   * {@inheritdoc ILogger.emitWarning}
   */
  public emitWarning(warning: Error): void {
    this._warnings.push(warning);
    this.terminal.writeWarningLine(`Warning: ${Logger.getErrorMessage(warning)}`);
    if (this._shouldPrintStacks && warning.stack) {
      this.terminal.writeWarningLine(warning.stack);
    }
  }

  private get _shouldPrintStacks(): boolean {
    return this._options.getShouldPrintStacks();
  }
}
