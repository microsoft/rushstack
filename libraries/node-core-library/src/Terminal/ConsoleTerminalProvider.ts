// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

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
    return process.stdout.columns;
  }

  public get supportsColor(): boolean {
    // If the console doesn't actually support colors, the colors library won't
    // return color characters when the Terminal formats text.
    return true;
  }
}
