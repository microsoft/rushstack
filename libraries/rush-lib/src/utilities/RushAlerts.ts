// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import type { RushConfiguration } from '../api/RushConfiguration';
import type { Terminal } from '@rushstack/terminal';

export interface IRushAlertsOptions {
  rushConfiguration: RushConfiguration;
  terminal: Terminal;
}

interface IRushAlerts {
  alerts: Array<IRushAlert>;
}
interface IRushAlert {
  title: string;
  details: Array<string>;
  detailsUrl: string;
}

export class RushAlerts {
  private readonly _rushConfiguration: RushConfiguration;
  private readonly _terminal: Terminal;

  public constructor(options: IRushAlertsOptions) {
    this._rushConfiguration = options.rushConfiguration;
    this._terminal = options.terminal;
  }

  private _printMessageInBoxStyle(alert: IRushAlert): void {
    const messageToBePrinted: Array<string> = [];
    messageToBePrinted.push(alert.title);
    messageToBePrinted.push(...alert.details);
    messageToBePrinted.push(alert.detailsUrl);

    // Calculate max length for the border
    const maxLength: number = messageToBePrinted.reduce((max, line) => Math.max(max, line.length), 0);

    // Add padding for border
    const paddedLength: number = maxLength + 4;

    // Create border lines
    const borderLine: string = '+'.padEnd(paddedLength - 1, '-') + '+';
    // const emptyLine = '|' + ' '.padEnd(maxLength + 2) + '|';

    // Print the box
    this._terminal.writeLine(borderLine);
    messageToBePrinted.forEach((line) => {
      const padding: number = maxLength - line.length;
      this._terminal.writeLine(`| ${line}${' '.repeat(padding)} |`);
    });
    this._terminal.writeLine(borderLine);
  }

  public async printAlertsAsync(): Promise<void> {
    // let's hardcode this first
    const rushAlertsStateFilePath: string = `${this._rushConfiguration.commonTempFolder}/rush-alerts.json`;

    try {
      if (existsSync(rushAlertsStateFilePath)) {
        const rushAlertsData: IRushAlerts = JSON.parse((await readFile(rushAlertsStateFilePath)).toString());
        if (rushAlertsData?.alerts.length !== 0) {
          for (const alert of rushAlertsData.alerts) {
            this._printMessageInBoxStyle(alert);
          }
        }
      }
    } catch (e) {
      // console the message only in debug mode
      this._terminal.writeDebugLine(e.message);
    }
  }
}
