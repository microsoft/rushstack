import {
  RushHooks,
  Utilities,
  RushHookName
} from '@microsoft/rush-lib';

export default class RushHooksManager {
  public constructor(private _rushHooks: RushHooks) {
  }

  public handle(hookName: RushHookName): void {
    this._rushHooks.get(hookName).forEach((script) => {
      // To be discussed.
      // Utilities.executeCommand();
    });
  }
}