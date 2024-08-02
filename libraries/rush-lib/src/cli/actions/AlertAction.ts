// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ConsoleTerminalProvider, Terminal } from '@rushstack/terminal';
import type { CommandLineFlagParameter, CommandLineStringParameter } from '@rushstack/ts-command-line';

import type { RushCommandLineParser } from '../RushCommandLineParser';
import { BaseRushAction } from './BaseRushAction';
import { RushAlerts } from '../../utilities/RushAlerts';

export class AlertAction extends BaseRushAction {
  private readonly _terminal: Terminal;
  private readonly _snoozeParameter: CommandLineStringParameter;
  private readonly _snoozeTimeFlagParameter: CommandLineFlagParameter;

  public constructor(parser: RushCommandLineParser) {
    super({
      actionName: 'alert',
      summary: 'Display alerts',
      documentation: 'This command displays alerts that may be relevant to the current project.',
      parser
    });
    this._terminal = new Terminal(new ConsoleTerminalProvider({ verboseEnabled: parser.isDebug }));

    this._snoozeParameter = this.defineStringParameter({
      parameterLongName: '--snooze',
      parameterShortName: '-s',
      argumentName: 'SNOOZE',
      description: 'Snooze the alert'
    });

    this._snoozeTimeFlagParameter = this.defineFlagParameter({
      parameterLongName: '--forever',
      description: 'Snooze the alert for a long time'
    });
  }

  public async runAsync(): Promise<void> {
    const rushAlerts: RushAlerts = await RushAlerts.loadFromConfigurationAsync(
      this.rushConfiguration,
      this._terminal
    );
    const snoozeAlertIndex: string | undefined = this._snoozeParameter.value;
    if (snoozeAlertIndex) {
      const snoozeTimeFlag: boolean = this._snoozeTimeFlagParameter.value;
      await rushAlerts.snoozeAlertsAsync(Number(snoozeAlertIndex) - 1, snoozeTimeFlag);
    }
    await rushAlerts.printAllAlertsAsync();
  }
}
