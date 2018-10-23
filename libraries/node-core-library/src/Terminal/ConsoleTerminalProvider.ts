const { supportsColor } = require('colors/lib/system/supports-color');

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
    return process.stdout.rows;
  }

  public get supportsColor(): boolean {
    return supportsColor();
  }
}
