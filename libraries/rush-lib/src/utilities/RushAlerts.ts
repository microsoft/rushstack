// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import type { Terminal } from '@rushstack/terminal';
import type { RushConfiguration } from '../api/RushConfiguration';

export interface IRushAlertsOptions {
  rushConfiguration: RushConfiguration;
  terminal: Terminal;
}

interface IRushAlertsConfig {
  alerts: Array<IRushAlertsConfigEntry>;
}
interface IRushAlertsConfigEntry {
  title: string;
  details: Array<string>;
  detailsUrl: string;
  startTime: string;
  endTime: string;
  condition?: string;
}
interface IRushAlertsState {
  lastUpdateTime: string;
  alerts: Array<IRushAlertStateEntry>;
}
interface IRushAlertStateEntry {
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

  public async isAlertsStateUpToDateAsync(): Promise<boolean> {
    const rushAlertsStateFilePath: string = `${this._rushConfiguration.commonTempFolder}/alerts-state.json`;
    if (!existsSync(rushAlertsStateFilePath)) {
      return false;
    }
    const rushAlertsData: IRushAlertsState = JSON.parse((await readFile(rushAlertsStateFilePath)).toString());

    if (rushAlertsData.lastUpdateTime) {
      const currentTime: Date = new Date();
      const lastUpdateTime: Date = new Date(rushAlertsData.lastUpdateTime);

      const hours: number = (Number(currentTime) - Number(lastUpdateTime)) / (1000 * 60 * 60);

      if (hours > 24) {
        return false;
      }
    }
    return true;
  }

  public async retrieveAlertsAsync(): Promise<void> {
    const rushAlertsConfigFilePath: string = `${this._rushConfiguration.commonRushConfigFolder}/alerts-config.json`;
    try {
      if (existsSync(rushAlertsConfigFilePath)) {
        const rushAlertsConfig: IRushAlertsConfig = JSON.parse(
          (await readFile(rushAlertsConfigFilePath)).toString()
        );

        const validAlerts: Array<IRushAlertStateEntry> = [];
        if (rushAlertsConfig?.alerts.length !== 0) {
          for (const alert of rushAlertsConfig.alerts) {
            if (await this._isAlertValidAsync(alert)) {
              validAlerts.push({
                title: alert.title,
                details: alert.details,
                detailsUrl: alert.detailsUrl
              });
            }
          }
        }

        if (validAlerts.length > 0) {
          const rushAlertsState: IRushAlertsState = {
            lastUpdateTime: new Date().toString(),
            alerts: validAlerts
          };
          await this._writeRushAlertStateAsync(rushAlertsState);
        }
      }
    } catch (e) {
      // console the message only in debug mode
      this._terminal.writeDebugLine(e.message);
    }
  }

  public async printAlertsAsync(): Promise<void> {
    const rushAlertsStateFilePath: string = `${this._rushConfiguration.commonTempFolder}/alerts-state.json`;

    try {
      if (existsSync(rushAlertsStateFilePath)) {
        const rushAlertsData: IRushAlertsState = JSON.parse(
          (await readFile(rushAlertsStateFilePath)).toString()
        );
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

  private async _isAlertValidAsync(alert: IRushAlertsConfigEntry): Promise<boolean> {
    const timeNow: Date = new Date();
    if (timeNow < new Date(alert.startTime) || timeNow > new Date(alert.endTime)) {
      return false;
    }
    if (alert.condition) {
      const conditionScriptPath: string = `${this._rushConfiguration.rushJsonFolder}/${alert.condition}`;
      if (!existsSync(conditionScriptPath)) {
        this._terminal.writeDebugLine(`${conditionScriptPath} is not exist!`);
        return false;
      }

      if (!(await require(`${this._rushConfiguration.rushJsonFolder}/${alert.condition}`))()) {
        return false;
      }
    }
    return true;
  }

  private _printMessageInBoxStyle(alert: IRushAlertStateEntry): void {
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

    // Print the box
    this._terminal.writeLine(borderLine);
    messageToBePrinted.forEach((line) => {
      const padding: number = maxLength - line.length;
      this._terminal.writeLine(`| ${line}${' '.repeat(padding)} |`);
    });
    this._terminal.writeLine(borderLine);
  }

  private async _writeRushAlertStateAsync(rushAlertsState: IRushAlertsState): Promise<void> {
    await writeFile(
      `${this._rushConfiguration.commonTempFolder}/alerts-state.json`,
      JSON.stringify(rushAlertsState, null, 2)
    );
  }
}
