// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { EOL } from 'os';
import { enabled as supportsColor } from 'colors/safe';

import { ITerminalProvider, TerminalProviderSeverity } from './ITerminalProvider';

/**
 * Options to be provided to a {@link ConsoleTerminalProvider}
 *
 * @beta
 */
export interface IConsoleTerminalProviderOptions {
  /**
   * If true, print verbose logging messages.
   */
  verboseEnabled: boolean;

  /**
   * If true, print debug logging messages. Note that "verbose" and "debug" are considered
   * separate message filters; if you want debug to imply verbose, it is up to your
   * application code to enforce that.
   */
  debugEnabled: boolean;
}

/**
 * Terminal provider that prints to STDOUT (for log- and verbose-level messages) and
 * STDERR (for warning- and error-level messsages).
 *
 * @beta
 */
export class ConsoleTerminalProvider implements ITerminalProvider {
  /**
   * If true, verbose-level messages should be written to the console.
   */
  public verboseEnabled: boolean = false;

  /**
   * If true, debug-level messages should be written to the console.
   */
  public debugEnabled: boolean = false;

  public constructor(options: Partial<IConsoleTerminalProviderOptions> = {}) {
    this.verboseEnabled = !!options.verboseEnabled;
    this.debugEnabled = !!options.debugEnabled;
  }

  /**
   * {@inheritDoc ITerminalProvider.write}
   */
  public write(data: string, severity: TerminalProviderSeverity): void {
    switch (severity) {
      case TerminalProviderSeverity.warning:
      case TerminalProviderSeverity.error: {
        process.stderr.write(data);
        break;
      }

      case TerminalProviderSeverity.verbose: {
        if (this.verboseEnabled) {
          process.stdout.write(data);
        }
        break;
      }

      case TerminalProviderSeverity.debug: {
        if (this.debugEnabled) {
          process.stdout.write(data);
        }
        break;
      }

      case TerminalProviderSeverity.log:
      default: {
        process.stdout.write(data);
        break;
      }
    }
  }

  /**
   * {@inheritDoc ITerminalProvider.eolCharacter}
   */
  public get eolCharacter(): string {
    return EOL;
  }

  /**
   * {@inheritDoc ITerminalProvider.supportsColor}
   */
  public get supportsColor(): boolean {
    return supportsColor;
  }
}
