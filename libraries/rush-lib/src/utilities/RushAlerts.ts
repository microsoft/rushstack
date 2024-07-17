// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { Terminal } from '@rushstack/terminal';
import type { RushConfiguration } from '../api/RushConfiguration';
import { FileSystem, JsonFile, JsonSchema, JsonSyntax } from '@rushstack/node-core-library';
import rushAlertsSchemaJson from '../schemas/rush-alerts.schema.json';

export interface IRushAlertsOptions {
  rushConfiguration: RushConfiguration;
  terminal: Terminal;
}

interface IRushAlertsConfig {
  alerts: Array<IRushAlertsConfigEntry>;
}
interface IRushAlertsConfigEntry {
  title: string;
  message: Array<string>;
  detailsUrl: string;
  startTime: string;
  endTime: string;
  conditionScript?: string;
}
interface IRushAlertsState {
  lastUpdateTime: string;
  alerts: Array<IRushAlertStateEntry>;
}
interface IRushAlertStateEntry {
  title: string;
  message: Array<string>;
  detailsUrl: string;
}

export class RushAlerts {
  private readonly _rushConfiguration: RushConfiguration;
  private readonly _terminal: Terminal;
  private static _rushAlertsJsonSchema: JsonSchema = JsonSchema.fromLoadedObject(rushAlertsSchemaJson);
  private static __rushAlertsConfigFileName: string = 'rush-alerts.json';
  private static __rushAlertsStateFileName: string = 'rush-alerts-state.json';

  public constructor(options: IRushAlertsOptions) {
    this._rushConfiguration = options.rushConfiguration;
    this._terminal = options.terminal;
  }

  public async isAlertsStateUpToDateAsync(): Promise<boolean> {
    const rushAlertsStateFilePath: string = `${this._rushConfiguration.commonTempFolder}/${RushAlerts.__rushAlertsStateFileName}`;
    if (!(await FileSystem.existsAsync(rushAlertsStateFilePath))) {
      return false;
    }
    const rushAlertsData: IRushAlertsState = await JsonFile.loadAsync(rushAlertsStateFilePath, {
      jsonSyntax: JsonSyntax.JsonWithComments
    });

    if (!rushAlertsData.lastUpdateTime) {
      return false;
    }

    const currentTime: Date = new Date();
    const lastUpdateTime: Date = new Date(rushAlertsData.lastUpdateTime);

    const hours: number = (Number(currentTime) - Number(lastUpdateTime)) / (1000 * 60 * 60);

    if (hours > 24) {
      return false;
    }

    return true;
  }

  public async retrieveAlertsAsync(): Promise<void> {
    const rushAlertsConfigFilePath: string = `${this._rushConfiguration.commonRushConfigFolder}/${RushAlerts.__rushAlertsConfigFileName}`;

    if (await FileSystem.existsAsync(rushAlertsConfigFilePath)) {
      const rushAlertsConfig: IRushAlertsConfig = JsonFile.loadAndValidate(
        rushAlertsConfigFilePath,
        RushAlerts._rushAlertsJsonSchema
      );
      const validAlerts: Array<IRushAlertStateEntry> = [];
      if (rushAlertsConfig?.alerts.length !== 0) {
        for (const alert of rushAlertsConfig.alerts) {
          if (await this._isAlertValidAsync(alert)) {
            validAlerts.push({
              title: alert.title,
              message: alert.message,
              detailsUrl: alert.detailsUrl
            });
          }
        }
      }

      await this._writeRushAlertStateAsync(validAlerts);
    }
  }

  public async printAlertsAsync(): Promise<void> {
    const rushAlertsStateFilePath: string = `${this._rushConfiguration.commonTempFolder}/${RushAlerts.__rushAlertsStateFileName}`;

    if (await FileSystem.existsAsync(rushAlertsStateFilePath)) {
      const rushAlertsData: IRushAlertsState = await JsonFile.loadAsync(rushAlertsStateFilePath, {
        jsonSyntax: JsonSyntax.Strict
      });
      if (rushAlertsData?.alerts.length !== 0) {
        for (const alert of rushAlertsData.alerts) {
          this._printMessageInBoxStyle(alert);
        }
      }
    }
  }

  private static _parseDate(dateString: string): Date {
    const parsedDate: Date = new Date(dateString);
    if (isNaN(parsedDate.getTime())) {
      throw new Error(`Invalid date/time value ${JSON.stringify(dateString)}`);
    }
    return parsedDate;
  }

  private async _isAlertValidAsync(alert: IRushAlertsConfigEntry): Promise<boolean> {
    const timeNow: Date = new Date();

    if (alert.startTime) {
      const startTime: Date = RushAlerts._parseDate(alert.startTime);
      if (timeNow < startTime) {
        return false;
      }
    }

    if (alert.endTime) {
      const endTime: Date = RushAlerts._parseDate(alert.endTime);
      if (timeNow > endTime) {
        return false;
      }
    }

    if (alert.conditionScript) {
      const conditionScriptPath: string = `${this._rushConfiguration.rushJsonFolder}/${alert.conditionScript}`;
      if (!(await FileSystem.existsAsync(conditionScriptPath))) {
        this._terminal.writeDebugLine(`${conditionScriptPath} does not exist`);
        return false;
      }

      if (!(await require(`${this._rushConfiguration.rushJsonFolder}/${alert.conditionScript}`))()) {
        return false;
      }
    }
    return true;
  }

  private _printMessageInBoxStyle(alert: IRushAlertStateEntry): void {
    const messageToBePrinted: Array<string> = [];
    messageToBePrinted.push(alert.title);
    messageToBePrinted.push(...alert.message);
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

  private async _writeRushAlertStateAsync(validAlerts: Array<IRushAlertStateEntry>): Promise<void> {
    const rushAlertsStateFilePath: string = `${this._rushConfiguration.commonTempFolder}/${RushAlerts.__rushAlertsStateFileName}`;

    if (validAlerts.length > 0) {
      const rushAlertsState: IRushAlertsState = {
        lastUpdateTime: new Date().toString(),
        alerts: validAlerts
      };

      await JsonFile.saveAsync(
        rushAlertsState,
        `${this._rushConfiguration.commonTempFolder}/${RushAlerts.__rushAlertsStateFileName}`,
        {
          ignoreUndefinedValues: true,
          headerComment: 'THIS FILE IS MACHINE-GENERATED -- DO NOT MODIFY',
          jsonSyntax: JsonSyntax.JsonWithComments
        }
      );
    } else {
      // if no valid alerts
      // remove exist alerts state if exist
      await FileSystem.deleteFileAsync(rushAlertsStateFilePath);
    }
  }
}
