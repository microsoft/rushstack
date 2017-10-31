// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'os';
import * as colors from 'colors';

import EventHooks from '../../data/EventHooks';
import Utilities from '../../utilities/Utilities';
import { Event } from '../../data/EventHooks';
import { Stopwatch } from '../../utilities/Stopwatch';

export default class EventHooksManager {
  public constructor(private _eventHooks: EventHooks) {
  }

  public handle(event: Event, isDebug: boolean = false): void {
    if (!this._eventHooks) {
      return;
    }
    const scripts: string[] = this._eventHooks.get(event);
    if (scripts.length > 0) {
      const stopwatch: Stopwatch = Stopwatch.start();
      console.log(os.EOL + colors.green(`Executing event hooks for ${Event[event]}`));
      scripts.forEach((script) => {
        try {
          Utilities.executeShellCommand(script,
            process.cwd(),
            process.env,
            true
          );
        } catch (error) {
          console.error(`${os.EOL} Event hook "${script}" failed. Run "rush" with --debug` +
            ` to see detailed error information.`);
          if (isDebug) {
            console.error(os.EOL + error.message);
          }
        }
      });
      stopwatch.stop();
      console.log(os.EOL + colors.green(`Event hooks finished. (${stopwatch.toString()})`));
    }
  }
}