// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { enabled as supportsColor } from 'colors/safe';

import { ITerminalProvider, Severity } from './ITerminalProvider';

export interface IConsoleTerminalProviderOptions {
  verboseEnabled: boolean;
}

/**
 * @beta
 */
export class ConsoleTerminalProvider implements ITerminalProvider {
  public verboseEnabled: boolean = false;

  public constructor(options: Partial<IConsoleTerminalProviderOptions> = {}) {
    this.verboseEnabled = !!options.verboseEnabled;
  }

  public write(data: string, severity: Severity): void {
    switch (severity) {
      case Severity.warning:
      case Severity.error: {
        process.stderr.write(data);
        break;
      }

      case Severity.verbose: {
        if (this.verboseEnabled) {
          process.stdout.write(data);
        }
        break;
      }

      case Severity.log:
      default: {
        process.stdout.write(data);
        break;
      }
    }
  }

  public get supportsColor(): boolean {
    return supportsColor;
  }
}
