import {
  RushHooks,
  Utilities,
  RushEvent
} from '@microsoft/rush-lib';

export default class RushHooksManager {
  public constructor(private _rushHooks: RushHooks) {
  }

  public handle(eventName: RushEvent): void {
    this._rushHooks.get(eventName).forEach((script) => {
      Utilities.executeCommandOnShell(script,
        process.cwd(),
        process.env);
    });
  }
}