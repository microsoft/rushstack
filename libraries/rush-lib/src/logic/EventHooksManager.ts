// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import colors from 'colors/safe';

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

  public handle(event: Event, isDebug: boolean, ignoreHooks: boolean): void {
    if (!this._eventHooks) {
      return;
    }

    const scripts: string[] = this._eventHooks.get(event);
    if (scripts.length > 0) {
      if (ignoreHooks) {
        console.log(`Skipping event hooks for ${Event[event]} since --ignore-hooks was specified`);
        return;
      }

      const stopwatch: Stopwatch = Stopwatch.start();
      console.log('\n' + colors.green(`Executing event hooks for ${Event[event]}`));

      const printEventHooksOutputToConsole: boolean | undefined =
        isDebug ||
        this._rushConfiguration.experimentsConfiguration.configuration.printEventHooksOutputToConsole;
      scripts.forEach((script) => {
        try {
          Utilities.executeLifecycleCommand(script, {
            rushConfiguration: this._rushConfiguration,
            workingDirectory: this._rushConfiguration.rushJsonFolder,
            initCwd: this._commonTempFolder,
            handleOutput: !printEventHooksOutputToConsole,
            environmentPathOptions: {
              includeRepoBin: true
            }
          });
        } catch (error) {
          console.error(
            '\n' +
              colors.yellow(
                `Event hook "${script}" failed. Run "rush" with --debug` +
                  ` to see detailed error information.`
              )
          );
          if (isDebug) {
            console.error('\n' + (error as Error).message);
          }
        }
      });
      stopwatch.stop();
      console.log('\n' + colors.green(`Event hooks finished. (${stopwatch.toString()})`));
    }
  }
}
