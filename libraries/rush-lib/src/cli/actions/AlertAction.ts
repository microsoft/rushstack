// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ConsoleTerminalProvider, Terminal } from '@rushstack/terminal';
import type { CommandLineStringParameter } from '@rushstack/ts-command-line';
import inquirer from 'inquirer';

import type { RushCommandLineParser } from '../RushCommandLineParser';
import { BaseRushAction } from './BaseRushAction';
import { RushAlerts } from '../../utilities/RushAlerts';

export class AlertAction extends BaseRushAction {
  private readonly _terminal: Terminal;
  private readonly _snooze: CommandLineStringParameter;

  public constructor(parser: RushCommandLineParser) {
    super({
      actionName: 'alert',
      summary: 'Display alerts',
      documentation: 'This command displays alerts that may be relevant to the current project.',
      parser
    });
    this._terminal = new Terminal(new ConsoleTerminalProvider({ verboseEnabled: parser.isDebug }));

    this._snooze = this.defineStringParameter({
      parameterLongName: '--snooze',
      parameterShortName: '-s',
      argumentName: 'SNOOZE',
      description: 'Snooze the alert'
    });
  }

  public async runAsync(): Promise<void> {
    const rushAlerts: RushAlerts = await RushAlerts.loadFromConfigurationAsync(
      this.rushConfiguration,
      this._terminal
    );
    const snoozeAlertIndex: string | undefined = this._snooze.value;
    if (snoozeAlertIndex) {
      const promptQuestions: inquirer.QuestionCollection = [
        {
          type: 'list',
          name: 'alertChoice',
          message: RushAlerts.ALERT_MESSAGE,
          choices: RushAlerts.ALERT_CHOICES
        }
      ];
      const answers: inquirer.Answers = await inquirer.prompt(promptQuestions);
      await rushAlerts.snoozeAlertsAsync(answers.alertChoice, Number(snoozeAlertIndex));
    } else {
      await rushAlerts.printAllAlertsAsync();
    }
  }
}
