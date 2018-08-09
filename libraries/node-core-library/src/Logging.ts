// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * @alpha
 */
export interface ILoggingProviderSet {
  /**
   * Logger for normal informational messages.
   */
  log: (message?: string) => void;

  /**
   * Logger for error messages.
   */
  error: (message?: string) => void;

  /**
   * Logger for warnings.
   */
  warn: (message?: string) => void;
}

/**
 * A generic logging provider, that supports sanetization of console colors.
 *
 * @alpha
 */
export class Logging {
  private static _colors: boolean = Logging._supportsColor();
  private static _loggingProviderSets: ILoggingProviderSet[] = [];

  /**
   * True if colors are enabled.
   */
  public static get colors(): boolean {
    return Logging._colors;
  }

  /**
   * Set to enable or disable printing of colors to the console.
   */
  public static set colors(value: boolean) {
    Logging._colors = value;
  }

  /**
   * Enables logging to the console.
   */
  public static registerConsoleLogging(): void {
    Logging.registerLoggingProviderSet({
      log: console.log,
      error: console.error,
      warn: console.warn
    });
  }

  /**
   * Register an arbitrary logging provider.
   */
  public static registerLoggingProviderSet(providerSet: ILoggingProviderSet): void {
    Logging._loggingProviderSets.push(providerSet);
  }

  /**
   * Log a message to the "log" provider.
   */
  public static log(message?: string): void {
    Logging._processMessage(message || '', ({ log }) => log);
  }

  /**
   * Log a message to the "error" provider.
   */
  public static error(message?: string): void {
    Logging._processMessage(message || '', ({ error }) => error);
  }

  /**
   * Log a message to the "warn" provider.
   */
  public static warn(message?: string): void {
    Logging._processMessage(message || '', ({ warn }) => warn);
  }

  private static _sanetizeColors(message: string): string {
    if (Logging.colors) {
      return message;
    } else {
      return message.replace(/\u001b\[\d{1,2}m/g, '');
    }
  }

  private static _processMessage(
    message: string,
    selectProvider: (providerSet: ILoggingProviderSet) => ((msg?: string) => void)
  ): void {
    const normalizedMessage: string = Logging._sanetizeColors(message);

    Logging._loggingProviderSets.forEach((providerSet: ILoggingProviderSet) => {
      try {
        selectProvider(providerSet)(normalizedMessage);
      } catch (e) {
        // Swallow the error
      }
    });
  }

  private static _supportsColor(): boolean {
    return (
      process.argv.indexOf('--no-color') === -1 &&
      process.argv.indexOf('--no-colors') === -1 &&
      process.argv.indexOf('--color=false') === -1
    );
  }
}
