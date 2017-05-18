// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'os';
import * as colors from 'colors';

import {
  EventHooks,
  Utilities,
  Event
} from '@microsoft/rush-lib';

export default class EventHooksManager {
  public constructor(private _eventHooks: EventHooks) {
  }

  public handle(event: Event): void {
    const scripts: string[] = this._eventHooks.get(event);
    if (scripts.length > 0) {
      console.log(os.EOL + colors.green(`Executing event hooks for ${Event[event]}`));
      scripts.forEach((script) => {
        Utilities.executeShellCommand(script,
          process.cwd(),
          process.env);
      });
      console.log(os.EOL + colors.green(`Event hooks finished successfully`));
    }
  }
}