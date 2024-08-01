// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import inquirer from 'inquirer';

import type { RushCommandLineParser } from '../RushCommandLineParser';
import { BaseRushAction } from './BaseRushAction';
import { RushAlerts } from '../../utilities/RushAlerts';
import { ConsoleTerminalProvider, Terminal } from '@rushstack/terminal';

export class SnoozeAlertAction extends BaseRushAction {
  private readonly _terminal: Terminal;

  public constructor(parser: RushCommandLineParser) {
    super({
      actionName: 'snooze-alert',
      summary: 'Snooze an alert',
      documentation:
        'This command snoozes an alert that was previously displayed. ' +
        'The alert will not be displayed again until the next time Rush is run.',
      parser
    });
    this._terminal = new Terminal(new ConsoleTerminalProvider({ verboseEnabled: parser.isDebug }));
  }

  public async runAsync(): Promise<void> {
    const promptQuestions: inquirer.QuestionCollection = [
      {
        type: 'list',
        name: 'alertChoice',
        message: RushAlerts.ALERT_MESSAGE,
        choices: RushAlerts.ALERT_CHOICES
      }
    ];
    const answers: inquirer.Answers = await inquirer.prompt(promptQuestions);
    const rushAlerts: RushAlerts = new RushAlerts({
      rushConfiguration: this.rushConfiguration,
      terminal: this._terminal
    });
    await rushAlerts.snoozeAlerts(answers.alertChoice);
  }
}
