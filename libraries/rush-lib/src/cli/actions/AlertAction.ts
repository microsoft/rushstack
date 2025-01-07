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
      summary: '(EXPERIMENTAL) View and manage Rush alerts for the repository',
      documentation:
        'This command displays the Rush alerts for this repository.  Rush alerts are customizable announcements' +
        ' and reminders that Rush prints occasionally on the command line.' +
        '  The alert definitions can be found in the rush-alerts.json config file.',
      parser
    });
    this._terminal = new Terminal(new ConsoleTerminalProvider({ verboseEnabled: parser.isDebug }));

    this._snoozeParameter = this.defineStringParameter({
      parameterLongName: '--snooze',
      parameterShortName: '-s',
      argumentName: 'ALERT_ID',
      description: 'Temporarily suspend the specified alert for one week'
    });

    this._snoozeTimeFlagParameter = this.defineFlagParameter({
      parameterLongName: '--forever',
      description: 'Combined with "--snooze", causes that alert to be suspended permanently'
    });
  }

  public async runAsync(): Promise<void> {
    const rushAlerts: RushAlerts = await RushAlerts.loadFromConfigurationAsync(
      this.rushConfiguration,
      this._terminal
    );
    const snoozeAlertId: string | undefined = this._snoozeParameter.value;
    if (snoozeAlertId) {
      const snoozeTimeFlag: boolean = this._snoozeTimeFlagParameter.value;
      await rushAlerts.snoozeAlertsByAlertIdAsync(snoozeAlertId, snoozeTimeFlag);
    }
    await rushAlerts.printAllAlertsAsync();
  }
}
