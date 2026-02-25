// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Colorize } from '@rushstack/terminal';

import type { EventHooks } from '../api/EventHooks.ts';
import { type IEnvironment, Utilities } from '../utilities/Utilities.ts';
import { Event } from '../api/EventHooks.ts';
import { Stopwatch } from '../utilities/Stopwatch.ts';
import type { RushConfiguration } from '../api/RushConfiguration.ts';
import { EnvironmentVariableNames } from '../api/EnvironmentConfiguration.ts';

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
        // eslint-disable-next-line no-console
        console.log(`Skipping event hooks for ${Event[event]} since --ignore-hooks was specified`);
        return;
      }

      const stopwatch: Stopwatch = Stopwatch.start();
      // eslint-disable-next-line no-console
      console.log('\n' + Colorize.green(`Executing event hooks for ${Event[event]}`));

      const printEventHooksOutputToConsole: boolean | undefined =
        isDebug ||
        this._rushConfiguration.experimentsConfiguration.configuration.printEventHooksOutputToConsole;
      scripts.forEach((script) => {
        try {
          const environment: IEnvironment = { ...process.env };

          // NOTE: Do NOT expose this variable to other subprocesses besides telemetry hooks.  We do NOT want
          // child processes to inspect Rush's raw command line and magically change their behavior in a way
          // that might be confusing to end users, or rely on CLI parameters that the build cache is unaware of.
          environment[EnvironmentVariableNames.RUSH_INVOKED_ARGS] = JSON.stringify(process.argv);

          Utilities.executeLifecycleCommand(script, {
            rushConfiguration: this._rushConfiguration,
            workingDirectory: this._rushConfiguration.rushJsonFolder,
            initCwd: this._commonTempFolder,
            handleOutput: !printEventHooksOutputToConsole,
            initialEnvironment: environment,
            environmentPathOptions: {
              includeRepoBin: true
            }
          });
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error(
            '\n' +
              Colorize.yellow(
                `Event hook "${script}" failed: ${error}\nRun "rush" with --debug` +
                  ` to see detailed error information.`
              )
          );
          if (isDebug) {
            // eslint-disable-next-line no-console
            console.error('\n' + (error as Error).message);
          }
        }
      });
      stopwatch.stop();
      // eslint-disable-next-line no-console
      console.log('\n' + Colorize.green(`Event hooks finished. (${stopwatch.toString()})`));
    }
  }
}
