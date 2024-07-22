// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { CommandLineFlagParameter } from '@rushstack/ts-command-line';

import { BaseRushAction } from './BaseRushAction';
import type { RushCommandLineParser } from '../RushCommandLineParser';
export class AlertAction extends BaseRushAction {
  private readonly _snoozeParameter: CommandLineFlagParameter;

  public constructor(parser: RushCommandLineParser) {
    super({
      actionName: 'alert',
      summary: 'Use this command to interact with Rush alert feature',
      documentation:
        'The "rush alert" command is used to interact with Rush alert feature.  For example,' +
        ' you can mute the alerts if you think they are annoying',
      parser
    });

    this._snoozeParameter = this.defineFlagParameter({
      parameterLongName: '--snooze',
      description: 'Snooze the alerts for today.'
    });
  }

  protected async runAsync(): Promise<void> {
    if (this._snoozeParameter.value!) {
      console.log('Snoozing');
    }
  }
}
