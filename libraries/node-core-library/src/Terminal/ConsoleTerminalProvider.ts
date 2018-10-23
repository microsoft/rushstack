import * as x from 'colors';
import { ITerminalProvider, Severity } from "./ITerminalProvider";

export class ConsoleTerminalProvider implements ITerminalProvider {
  public write(data: string, severity: Severity) {
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

  public get width(): number {
    return 0;
  }

  public get supportsColor(): boolean {
    x.
  }
}
