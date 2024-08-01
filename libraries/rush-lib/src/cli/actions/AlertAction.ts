// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ConsoleTerminalProvider, Terminal } from '@rushstack/terminal';
import type { RushCommandLineParser } from '../RushCommandLineParser';
import { BaseRushAction } from './BaseRushAction';
import { RushAlerts } from '../../utilities/RushAlerts';

export class AlertAction extends BaseRushAction {
  private readonly _terminal: Terminal;

  public constructor(parser: RushCommandLineParser) {
    super({
      actionName: 'alert',
      summary: 'Display alerts',
      documentation: 'This command displays alerts that may be relevant to the current project.',
      parser
    });
    this._terminal = new Terminal(new ConsoleTerminalProvider({ verboseEnabled: parser.isDebug }));
  }

  public async runAsync(): Promise<void> {
    const rushAlerts: RushAlerts = new RushAlerts({
      rushConfiguration: this.rushConfiguration,
      terminal: this._terminal
    });
    await rushAlerts.printAllAlertsAsync();
  }
}
