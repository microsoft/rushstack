// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { EOL } from 'node:os';

import supportsColor from 'supports-color';

import { type ITerminalProvider, TerminalProviderSeverity } from './ITerminalProvider';

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
 * STDERR (for warning- and error-level messages).
 *
 * @beta
 */
export class ConsoleTerminalProvider implements ITerminalProvider {
  public static readonly supportsColor: boolean = !!supportsColor.stdout && !!supportsColor.stderr;

  /**
   * If true, verbose-level messages should be written to the console.
   */
  public verboseEnabled: boolean;

  /**
   * If true, debug-level messages should be written to the console.
   */
  public debugEnabled: boolean;

  /**
   * {@inheritDoc ITerminalProvider.supportsColor}
   */
  public readonly supportsColor: boolean = ConsoleTerminalProvider.supportsColor;

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
}
