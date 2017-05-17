// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { IRushHooksJson } from './RushConfiguration';

/**
 * Events happen during Rush runs.
 * @alpha
 */
export enum RushEvent {
  /**
   * Post Rush build event.
   */
  postBuild = 1
}

/**
 * This class represents Rush hooks configured for this repo.
 * Hooks are customized script actions that Rush executes when specific events occur.
 * The actions are expressed as a command-line that is executed using the operating system shell.
 * @alpha
 */
export default class RushHooks {
  private _hooks: Map<RushEvent, string[]>;

  public constructor(rushHooksJson: IRushHooksJson) {
    this._hooks = new Map<RushEvent, string[]>();
    Object.getOwnPropertyNames(rushHooksJson).forEach((name) => {
      const eventName: RushEvent = RushEvent[name];
      if (eventName) {
        const foundHooks: string[] = [];
        if (rushHooksJson[name]) {
          rushHooksJson[name].forEach((hook) => {
            foundHooks.push(hook);
          });
        }
        this._hooks.set(eventName, foundHooks);
      }
    });
  }

  /**
   * Return all the scripts associated with the specified event.
   * @param event - Rush event
   */
  public get(event: RushEvent): string[] {
    return this._hooks.get(event) || [];
  }
}