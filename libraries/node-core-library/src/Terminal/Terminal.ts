import { ITerminalProvider } from "./ITerminalProvider";

export class Terminal {
  private _provider;

  public constructor(provider: ITerminalProvider) {
    this._provider = provider;
  }

  public write(message: string) {}
  public writeWarning(message: string) {}
  public writeError(message: string) {}
  public writeVerbose(message: string) {}
}
