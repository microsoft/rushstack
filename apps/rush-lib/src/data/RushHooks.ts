import { IRushHooksJson } from './RushConfiguration';
import Utilities from '../utilities/Utilities';

export default class RushHooks {
  private _postCommandHooks: string[];

  public constructor(rushHooksJson: IRushHooksJson) {
    this._postCommandHooks = rushHooksJson.postCommand;
  }

  public get postCommandHooks(): string[] {
    return this._postCommandHooks;
  }

  public onPostCommand(): void {
    this._postCommandHooks.forEach((script) => {
      Utilities.executeShellCommand(script);
    });
  }
}