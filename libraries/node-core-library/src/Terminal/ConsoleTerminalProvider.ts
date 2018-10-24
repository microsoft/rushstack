// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { enabled as supportsColor } from 'colors/safe';

import { ITerminalProvider, Severity } from './ITerminalProvider';

/**
 * @beta
 */
export class ConsoleTerminalProvider implements ITerminalProvider {
  public write(data: string, severity: Severity): void {
    switch (severity) {
      case Severity.warn:
      case Severity.error: {
        process.stderr.write(data);
        break;
      }

      case Severity.log:
      default: {
        process.stdout.write(data);
        break;
      }
    }
  }

  public get width(): number | undefined {
    return undefined;
  }

  public get supportsColor(): boolean {
    return supportsColor;
  }
}
