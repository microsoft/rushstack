// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { IRushHooksJson } from './RushConfiguration';

/**
 * Rush hook names
 * @alpha
 */
export enum RushHookName {
  /**
   * Hook name for post every rush command.
   */
  postBuild = 1
}

/**
 * This class represents rush hooks configured for this repo.
 * @alpha
 */
export default class RushHooks {
  private _hooks: Map<RushHookName, string[]>;

  public constructor(rushHooksJson: IRushHooksJson) {
    this._hooks = new Map<RushHookName, string[]>();
    Object.getOwnPropertyNames(rushHooksJson).forEach((name) => {
      const hookName: RushHookName = RushHookName[name];
      if (hookName) {
        const foundHooks: string[] = [];
        if (rushHooksJson[name]) {
          rushHooksJson[name].forEach((hook) => {
            foundHooks.push(hook);
          });
        }
        this._hooks.set(hookName, foundHooks);
      }
    });
  }

  /**
   * Return all the scripts associated with the specified hook name.
   * @param hookName - Rush hook name
   */
  public get(hookName: RushHookName): string[] {
    return this._hooks.get(hookName) || [];
  }
}