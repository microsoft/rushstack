// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'os';
import * as colors from 'colors';

import { EventHooks } from '../api/EventHooks';
import { Utilities } from '../utilities/Utilities';
import { Event } from '../api/EventHooks';
import { Stopwatch } from '../utilities/Stopwatch';
import { RushConfiguration } from '../api/RushConfiguration';

export class EventHooksManager {
  private _rushConfiguration: RushConfiguration;
  private _eventHooks: EventHooks;
  private _commonTempFolder: string;

  public constructor(rushConfiguration: RushConfiguration) {
    this._rushConfiguration = rushConfiguration;
    this._eventHooks = rushConfiguration.eventHooks;
    this._commonTempFolder = rushConfiguration.commonTempFolder;
  }

  public handle(event: Event, isDebug: boolean): void {
    if (!this._eventHooks) {
      return;
    }

    const scripts: string[] = this._eventHooks.get(event);
    if (scripts.length > 0) {
      const stopwatch: Stopwatch = Stopwatch.start();
      console.log(os.EOL + colors.green(`Executing event hooks for ${Event[event]}`));
      scripts.forEach((script) => {
        try {
          Utilities.executeLifecycleCommand(
            script,
            {
              rushConfiguration: this._rushConfiguration,
              workingDirectory: process.cwd(),
              initCwd: this._commonTempFolder,
              handleOutput: true,
              environmentPathOptions: {
                includeRepoBin: true
              }
            }
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