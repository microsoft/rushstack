import * as colors from 'colors';
import { EOL } from 'os';

import { ITerminalProvider, Severity } from './ITerminalProvider';

export class Terminal {
  private _provider: ITerminalProvider;

  public constructor(provider: ITerminalProvider) {
    this._provider = provider;
  }

  public write(message: string): void {
    this._provider.write(message + EOL, Severity.log);
  }

  public writeWarning(message: string): void {
    this._provider.write(colors.yellow(message) + EOL, Severity.warn);
  }

  public writeError(message: string): void {
    this._provider.write(colors.red(message) + EOL, Severity.error);
  }

  public writeVerbose(message: string): void {
    this._provider.write(message + EOL, Severity.log);
  }
}
