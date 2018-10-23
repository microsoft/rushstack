const { supportsColor } = require('colors/lib/system/supports-color');

import { ITerminalProvider, Severity } from './ITerminalProvider';

export class ConsoleTerminalProvider implements ITerminalProvider {
  public write(data: string, severity: Severity): void {
    switch (severity) {
      case Severity.error: {
        console.error(data);
        break;
      }

      case Severity.warn: {
        console.warn(data);
        break;
      }

      case Severity.log:
      default: {
        console.log(data);
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
