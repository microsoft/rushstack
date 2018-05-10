// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';
import * as os from 'os';

import { CommandLineFlagParameter } from '@microsoft/ts-command-line';

import { BaseRushAction } from './BaseRushAction';
import { Event } from '../../data/EventHooks';
import { InstallManager, IInstallManagerOptions } from '../logic/InstallManager';
import { PurgeManager } from '../logic/PurgeManager';
import { Stopwatch } from '../../utilities/Stopwatch';
import { Utilities } from '../../utilities/Utilities';

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

  protected abstract buildInstallOptions(): IInstallManagerOptions;

  protected run(): Promise<void> {
    const stopwatch: Stopwatch = Stopwatch.start();

    this.eventHooksManager.handle(Event.preRushInstall);

    const purgeManager: PurgeManager = new PurgeManager(this.rushConfiguration);
    const installManager: InstallManager = new InstallManager(this.rushConfiguration, purgeManager);

    if (this._purgeParameter.value!) {
      console.log('The --purge flag was specified, so performing "rush purge"');
      purgeManager.purgeNormal();
      console.log('');
    }

    const installManagerOptions: IInstallManagerOptions = this.buildInstallOptions();

    return Utilities.withFinally({
        promise: installManager.doInstall(installManagerOptions),
        finally: () => {
          purgeManager.deleteAll();
        }
      })
      .then((success: boolean) => {
        if (!success) {
          process.exitCode = 1;
        }

        stopwatch.stop();

        this._collectTelemetry(stopwatch, installManagerOptions, success);
        this.eventHooksManager.handle(Event.postRushInstall);

        if (success) {
          console.log(os.EOL + colors.green(
            `Rush ${this.actionName} finished successfully. (${stopwatch.toString()})`));
        } else {
          console.log(os.EOL + `Rush ${this.actionName} completed. (${stopwatch.toString()})`);
        }
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
