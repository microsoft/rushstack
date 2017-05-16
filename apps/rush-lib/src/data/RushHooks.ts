import { IRushHooksJson } from './RushConfiguration';

export default class RushHooks {
  private _postCommandHooks: string[];

  public constructor(rushHooksJson: IRushHooksJson) {
    this._postCommandHooks = rushHooksJson.postCommand;
  }

  public get postCommandHooks(): string[] {
    return this._postCommandHooks;
  }

  public onPostCommand(): void {
    this._postCommandHooks.forEach((action) => {
      console.log(action);
    });
  }
}