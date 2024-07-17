// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Colorize, PrintUtilities, type Terminal } from '@rushstack/terminal';
import type { RushConfiguration } from '../api/RushConfiguration';
import { FileSystem, JsonFile, JsonSchema, JsonSyntax } from '@rushstack/node-core-library';
import rushAlertsSchemaJson from '../schemas/rush-alerts.schema.json';
import { RushConstants } from '../logic/RushConstants';

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
  message: Array<string> | string;
  detailsUrl: string;
}

export class RushAlerts {
  private readonly _rushConfiguration: RushConfiguration;
  private readonly _terminal: Terminal;
  private static _rushAlertsJsonSchema: JsonSchema = JsonSchema.fromLoadedObject(rushAlertsSchemaJson);

  public readonly rushAlertsStateFilePath: string;

  public constructor(options: IRushAlertsOptions) {
    this._rushConfiguration = options.rushConfiguration;
    this._terminal = options.terminal;

    this.rushAlertsStateFilePath = `${this._rushConfiguration.commonTempFolder}/${RushConstants.rushAlertsConfigFilename}`;
  }

  private async _loadRushAlertsStateAsync(): Promise<IRushAlertsState | undefined> {
    if (!(await FileSystem.existsAsync(this.rushAlertsStateFilePath))) {
      return undefined;
    }
    const rushAlertsState: IRushAlertsState = await JsonFile.loadAsync(this.rushAlertsStateFilePath, {
      jsonSyntax: JsonSyntax.JsonWithComments
    });
    return rushAlertsState;
  }

  public async isAlertsStateUpToDateAsync(): Promise<boolean> {
    const rushAlertsState: IRushAlertsState | undefined = await this._loadRushAlertsStateAsync();

    if (rushAlertsState === undefined || !rushAlertsState.lastUpdateTime) {
      return false;
    }

    const currentTime: Date = new Date();
    const lastUpdateTime: Date = new Date(rushAlertsState.lastUpdateTime);

    const hours: number = (Number(currentTime) - Number(lastUpdateTime)) / (1000 * 60 * 60);

    if (hours > 24) {
      return false;
    }

    return true;
  }

  public async retrieveAlertsAsync(): Promise<void> {
    const rushAlertsConfigFilePath: string = `${this._rushConfiguration.commonRushConfigFolder}/${RushConstants.rushAlertsConfigFilename}`;

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
    const rushAlertsState: IRushAlertsState | undefined = await this._loadRushAlertsStateAsync();

    if (!rushAlertsState) {
      return;
    }

    if (rushAlertsState?.alerts.length !== 0) {
      this._terminal.writeLine();
      for (const alert of rushAlertsState.alerts) {
        this._printMessageInBoxStyle(alert);
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

    const conditionScript: string | undefined = alert.conditionScript;
    if (conditionScript) {
      // "(OPTIONAL) The filename of a script that determines whether this alert can be shown,
      // found in the "common/config/rush/alert-scripts" folder." ... "To ensure up-to-date alerts, Rush
      // may fetch and checkout the "common/config/rush-alerts" folder in an unpredictable temporary
      // path.  Therefore, your script should avoid importing dependencies from outside its folder,
      // generally be kept as simple and reliable and quick as possible."
      if (conditionScript.indexOf('/') >= 0 || conditionScript.indexOf('\\') >= 0) {
        throw new Error(
          `The rush-alerts.json file contains a "conditionScript" that is not inside the "alert-scripts" folder: ` +
            JSON.stringify(conditionScript)
        );
      }
      const conditionScriptPath: string = `${this._rushConfiguration.rushJsonFolder}/common/config/rush/alert-scripts/${conditionScript}`;
      if (!(await FileSystem.existsAsync(conditionScriptPath))) {
        throw new Error(
          'The "conditionScript" field in rush-alerts.json refers to a nonexistent file:\n' +
            conditionScriptPath
        );
      }

      this._terminal.writeDebugLine(`Invoking condition script "${conditionScript}" from rush-alerts.json`);
      const startTimemark: number = performance.now();

      interface IAlertsConditionScriptModule {
        canShowAlert(): boolean;
      }

      let conditionScriptModule: IAlertsConditionScriptModule;
      try {
        conditionScriptModule = require(conditionScriptPath);

        if (typeof conditionScriptModule.canShowAlert !== 'function') {
          throw new Error('The "canShowAlert" module export is missing');
        }
      } catch (e) {
        throw new Error(
          `Error loading condition script "${conditionScript}" from rush-alerts.json:\n${e.stack}`
        );
      }

      const oldCwd: string = process.cwd();

      let conditionResult: boolean;
      try {
        // "Rush will invoke this script with the working directory set to the monorepo root folder,
        // with no guarantee that `rush install` has been run."
        process.chdir(this._rushConfiguration.rushJsonFolder);
        conditionResult = conditionScriptModule.canShowAlert();

        if (typeof conditionResult !== 'boolean') {
          throw new Error('canShowAlert() did not return a boolean value');
        }
      } catch (e) {
        throw new Error(
          `Error invoking condition script "${conditionScript}" from rush-alerts.json:\n${e.stack}`
        );
      } finally {
        process.chdir(oldCwd);
      }

      const totalMs: number = performance.now() - startTimemark;
      this._terminal.writeDebugLine(
        `Invoked conditionScript "${conditionScript}"` +
          ` in ${Math.round(totalMs)} ms with result "${conditionResult}"`
      );

      if (!conditionResult) {
        return false;
      }
    }
    return true;
  }

  private _printMessageInBoxStyle(alert: IRushAlertStateEntry): void {
    const boxTitle: string = alert.title.toUpperCase();

    const boxMessage: string = typeof alert.message === 'string' ? alert.message : alert.message.join('');

    const boxDetails: string = alert.detailsUrl ? 'Details: ' + alert.detailsUrl : '';

    // ...minus the padding.
    const PADDING: number = '╔══╗'.length;

    // Try to make it wide enough to fit the (unwrapped) strings...
    let lineLength: number = Math.max(boxTitle.length, boxMessage.length, boxDetails.length);

    // ...but don't exceed the console width, and also keep it under 80...
    lineLength = Math.min(lineLength, (PrintUtilities.getConsoleWidth() ?? 80) - PADDING, 80 - PADDING);

    // ...and the width needs to be at least 40 characters...
    lineLength = Math.max(lineLength, 40 - PADDING);

    const lines: string[] = [
      ...PrintUtilities.wrapWordsToLines(boxTitle, lineLength).map((x) =>
        Colorize.bold(x.padEnd(lineLength))
      ),
      '',
      ...PrintUtilities.wrapWordsToLines(boxMessage, lineLength).map((x) => x.padEnd(lineLength))
    ];
    if (boxDetails) {
      lines.push(
        '',
        ...PrintUtilities.wrapWordsToLines(boxDetails, lineLength).map((x) =>
          Colorize.cyan(x.padEnd(lineLength))
        )
      );
    }

    // Print the box
    this._terminal.writeLine('╔═' + '═'.repeat(lineLength) + '═╗');
    for (const line of lines) {
      this._terminal.writeLine(`║ ${line.padEnd(lineLength)} ║`);
    }
    this._terminal.writeLine('╚═' + '═'.repeat(lineLength) + '═╝');
  }

  private async _writeRushAlertStateAsync(validAlerts: Array<IRushAlertStateEntry>): Promise<void> {
    if (validAlerts.length > 0) {
      const rushAlertsState: IRushAlertsState = {
        lastUpdateTime: new Date().toISOString(),
        alerts: validAlerts
      };

      await JsonFile.saveAsync(rushAlertsState, this.rushAlertsStateFilePath, {
        ignoreUndefinedValues: true,
        headerComment: '// THIS FILE IS MACHINE-GENERATED -- DO NOT MODIFY',
        jsonSyntax: JsonSyntax.JsonWithComments
      });
    } else {
      // if no valid alerts
      // remove exist alerts state if exist
      await FileSystem.deleteFileAsync(this.rushAlertsStateFilePath);
    }
  }
}
