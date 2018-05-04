// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';
import * as os from 'os';

import { CommandLineFlagParameter } from '@microsoft/ts-command-line';

import { AsyncRecycler } from '../../utilities/AsyncRecycler';
import { BaseRushAction } from './BaseRushAction';
import { Event } from '../../data/EventHooks';
import { InstallManager } from '../logic/InstallManager';
import { RushCommandLineParser } from './RushCommandLineParser';
import { Stopwatch } from '../../utilities/Stopwatch';
import { Utilities } from '../../utilities/Utilities';

export class InstallAction extends BaseRushAction {
  private _cleanParameter: CommandLineFlagParameter;
  private _bypassPolicyParameter: CommandLineFlagParameter;
  private _noLinkParameter: CommandLineFlagParameter;

  constructor(parser: RushCommandLineParser) {
    super({
      actionName: 'install',
      summary: '',
      documentation: '',
      parser
    });
  }

  protected onDefineParameters(): void {
    this._cleanParameter = this.defineFlagParameter({
      parameterLongName: '--clean',
      parameterShortName: '-c',
      description: ''
    });
    this._bypassPolicyParameter = this.defineFlagParameter({
      parameterLongName: '--bypass-policy',
      description: 'Overrides "gitPolicy" enforcement (use honorably!)'
    });
    this._noLinkParameter = this.defineFlagParameter({
      parameterLongName: '--no-link',
      description: ''
    });
  }

  protected run(): Promise<void> {
    const stopwatch: Stopwatch = Stopwatch.start();

    this.eventHooksManager.handle(Event.preRushInstall);

    const asyncRecycler: AsyncRecycler = new AsyncRecycler(this.rushConfiguration);
    const installManager: InstallManager = new InstallManager(this.rushConfiguration, asyncRecycler);

    return Utilities.withFinally({
        promise: installManager.doInstall({
          allowShrinkwrapUpdates: false,
          bypassPolicy: this._bypassPolicyParameter.value!,
          noLink: this._noLinkParameter.value!,
          fullUpgrade: false,
          forceUpdateShrinkwrap: false
        }),
        finally: () => {
          asyncRecycler.deleteAll();
        }
      })
      .then((success: boolean) => {
        if (!success) {
          process.exitCode = 1;
        }

        stopwatch.stop();

        this._collectTelemetry(stopwatch, true);
        this.eventHooksManager.handle(Event.postRushInstall);

        if (success) {
          console.log(os.EOL + colors.green(`Rush install finished successfully. (${stopwatch.toString()})`));
        } else {
          console.log(os.EOL + `Rush install completed. (${stopwatch.toString()})`);
        }

      });
  }

  private _collectTelemetry(stopwatch: Stopwatch, success: boolean): void {
    if (this.parser.telemetry) {
      this.parser.telemetry.log({
        name: 'install',
        duration: stopwatch.duration,
        result: success ? 'Succeeded' : 'Failed',
        extraData: {
          mode: 'install',
          clean: (!!this._cleanParameter.value).toString()
        }
      });
    }
  }

}
