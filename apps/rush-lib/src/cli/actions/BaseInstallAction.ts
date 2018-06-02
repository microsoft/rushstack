// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';
import * as os from 'os';

import { CommandLineFlagParameter } from '@microsoft/ts-command-line';

import { BaseRushAction } from './BaseRushAction';
import { Event } from '../../data/EventHooks';
import { InstallManager, IInstallManagerOptions } from '../logic/InstallManager';
import { PurgeManager } from '../logic/PurgeManager';
import { SetupChecks } from '../logic/SetupChecks';
import { Stopwatch } from '../../utilities/Stopwatch';

/**
 * This is the common base class for InstallAction and UpdateAction.
 */
export abstract class BaseInstallAction extends BaseRushAction {
  protected _purgeParameter: CommandLineFlagParameter;
  protected _bypassPolicyParameter: CommandLineFlagParameter;
  protected _noLinkParameter: CommandLineFlagParameter;

  protected onDefineParameters(): void {
    this._purgeParameter = this.defineFlagParameter({
      parameterLongName: '--purge',
      parameterShortName: '-p',
      description: 'Perform "rush purge" before starting the installation'
    });
    this._bypassPolicyParameter = this.defineFlagParameter({
      parameterLongName: '--bypass-policy',
      description: 'Overrides enforcement of the "gitPolicy" rules from rush.json (use honorably!)'
    });
    this._noLinkParameter = this.defineFlagParameter({
      parameterLongName: '--no-link',
      description: 'If "--no-link" is specified, then project symlinks will NOT be created'
        + ' after the installation completes.  You will need to run "rush link" manually.'
        + ' This flag is useful for automated builds that want to report stages individually'
        + ' or perform extra operations in between the two stages.'
    });
  }

  protected abstract buildInstallOptions(): IInstallManagerOptions;

  protected run(): Promise<void> {
    const stopwatch: Stopwatch = Stopwatch.start();

    SetupChecks.validate(this.rushConfiguration);

    this.eventHooksManager.handle(Event.preRushInstall, this.parser.isDebug);

    const purgeManager: PurgeManager = new PurgeManager(this.rushConfiguration);
    const installManager: InstallManager = new InstallManager(this.rushConfiguration, purgeManager);

    if (this._purgeParameter.value!) {
      console.log('The --purge flag was specified, so performing "rush purge"');
      purgeManager.purgeNormal();
      console.log('');
    }

    const installManagerOptions: IInstallManagerOptions = this.buildInstallOptions();

    return installManager.doInstall(installManagerOptions)
      .then(() => {
        purgeManager.deleteAll();
        stopwatch.stop();

        this._collectTelemetry(stopwatch, installManagerOptions, true);
        this.eventHooksManager.handle(Event.postRushInstall, this.parser.isDebug);

        console.log(os.EOL + colors.green(
          `Rush ${this.actionName} finished successfully. (${stopwatch.toString()})`));
      })
      .catch((error) => {
        purgeManager.deleteAll();
        stopwatch.stop();

        this._collectTelemetry(stopwatch, installManagerOptions, false);
        throw error;
      });
  }

  private _collectTelemetry(stopwatch: Stopwatch, installManagerOptions: IInstallManagerOptions,
    success: boolean): void {

    if (this.parser.telemetry) {
      this.parser.telemetry.log({
        name: 'install',
        duration: stopwatch.duration,
        result: success ? 'Succeeded' : 'Failed',
        extraData: {
          mode: this.actionName,
          clean: (!!this._purgeParameter.value).toString(),
          full: installManagerOptions.fullUpgrade.toString()
        }
      });
    }
  }

}
