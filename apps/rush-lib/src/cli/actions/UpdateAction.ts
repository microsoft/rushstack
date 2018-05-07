// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';
import * as os from 'os';

import { CommandLineFlagParameter } from '@microsoft/ts-command-line';

import { BaseRushAction } from './BaseRushAction';
import { Event } from '../../data/EventHooks';
import { InstallManager } from '../logic/InstallManager';
import { PurgeManager } from '../logic/PurgeManager';
import { RushCommandLineParser } from './RushCommandLineParser';
import { Stopwatch } from '../../utilities/Stopwatch';
import { Utilities } from '../../utilities/Utilities';

export class UpdateAction extends BaseRushAction {
  private _cleanParameter: CommandLineFlagParameter;
  private _bypassPolicyParameter: CommandLineFlagParameter;
  private _noLinkParameter: CommandLineFlagParameter;
  private _fullParameter: CommandLineFlagParameter;
  private _forceUpdateParameter: CommandLineFlagParameter;

  constructor(parser: RushCommandLineParser) {
    super({
      actionName: 'update',
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
    this._fullParameter = this.defineFlagParameter({
      parameterLongName: '--full',
      description: ''
    });
    this._forceUpdateParameter = this.defineFlagParameter({
      parameterLongName: '--force-update',
      description: ''
    });
  }

  protected run(): Promise<void> {
    const stopwatch: Stopwatch = Stopwatch.start();

    this.eventHooksManager.handle(Event.preRushInstall);

    const purgeManager: PurgeManager = new PurgeManager(this.rushConfiguration);
    const installManager: InstallManager = new InstallManager(this.rushConfiguration, purgeManager);

    if (this._cleanParameter.value!) {
      console.log('The --clean flag was specified, so performing "rush purge"');
      purgeManager.purgeNormal();
      console.log('');
    }

    return Utilities.withFinally({
        promise: installManager.doInstall({
          allowShrinkwrapUpdates: true,
          bypassPolicy: this._bypassPolicyParameter.value!,
          noLink: this._noLinkParameter.value!,
          fullUpgrade: this._fullParameter.value!,
          forceUpdateShrinkwrap: this._forceUpdateParameter.value!
        }),
        finally: () => {
          purgeManager.deleteAll();
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
          console.log(os.EOL + colors.green(`Rush update finished successfully. (${stopwatch.toString()})`));
        } else {
          console.log(os.EOL + `Rush update completed. (${stopwatch.toString()})`);
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
          mode: 'update',
          clean: (!!this._cleanParameter.value).toString(),
          full: (!!this._fullParameter.value).toString()
        }
      });
    }
  }

}
