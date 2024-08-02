// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Colorize, PrintUtilities, type Terminal } from '@rushstack/terminal';
import type { RushConfiguration } from '../api/RushConfiguration';
import { FileSystem, JsonFile, JsonSchema, JsonSyntax } from '@rushstack/node-core-library';
import rushAlertsSchemaJson from '../schemas/rush-alerts.schema.json';
import { RushConstants } from '../logic/RushConstants';
import { c } from 'tar';

export interface IRushAlertsOptions {
  terminal: Terminal;
  rushJsonFolder: string;
  rushAlertsConfig: IRushAlertsConfig | undefined;
  rushAlertsState: IRushAlertsState | undefined;
  rushAlertsConfigFilePath: string;
  rushAlertsStateFilePath: string;
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
  priority?: AlertPriority;
  maximumDisplayInterval?: AlertDisplayInterval;
}
interface IRushAlertsState {
  lastUpdateTime: string;
  snooze: boolean;
  snoozeEndTime?: string;
  alerts: Array<IRushAlertStateEntry>;
}
interface IRushAlertStateEntry {
  title: string;
  message: Array<string> | string;
  detailsUrl: string;
  maxDailyDisplays?: number;
  currentDisplayCount?: number;
  lastDisplayTime?: string;
  priority?: AlertPriority;
  maximumDisplayInterval?: AlertDisplayInterval;
}

const enum AlertChoice {
  SHOW_ALERTS = 'Show me alerts',
  NEVER_SHOW_ALERTS = 'Never show me alerts',
  DO_NOT_SHOW_THIS_WEEK = 'Do not show alerts this week'
}

const enum AlertDisplayInterval {
  ALWAYS = 'always',
  MONTHLY = 'monthly',
  WEEKLY = 'weekly',
  DAILY = 'daily',
  HOURLY = 'hourly'
}

const enum AlertPriority {
  HIGH = 'high',
  NORMAL = 'normal',
  LOW = 'low'
}

export class RushAlerts {
  private readonly _terminal: Terminal;

  private readonly _rushAlertsConfig: IRushAlertsConfig | undefined;
  private readonly _rushAlertsState: IRushAlertsState | undefined;

  private readonly _rushJsonFolder: string;
  public readonly rushAlertsStateFilePath: string;
  public readonly rushAlertsConfigFilePath: string;

  public static readonly ALERT_MESSAGE: string = 'How would you like to handle alerts?';
  public static readonly ALERT_CHOICES: string[] = [
    AlertChoice.SHOW_ALERTS,
    AlertChoice.NEVER_SHOW_ALERTS,
    AlertChoice.DO_NOT_SHOW_THIS_WEEK
  ];
  public static readonly ALERT_PRIORITY: string[] = [
    AlertPriority.HIGH,
    AlertPriority.NORMAL,
    AlertPriority.LOW
  ];
  public static readonly alertDisplayIntervalDurations: Map<AlertDisplayInterval, number> = new Map([
    [AlertDisplayInterval.ALWAYS, -1],
    [AlertDisplayInterval.MONTHLY, 1000 * 60 * 60 * 24 * 30],
    [AlertDisplayInterval.WEEKLY, 1000 * 60 * 60 * 24 * 7],
    [AlertDisplayInterval.DAILY, 1000 * 60 * 60 * 24],
    [AlertDisplayInterval.HOURLY, 1000 * 60 * 60]
  ]);
  public static readonly DISPLAY_ALERT_COMMAND_LIST: string[] = ['alert', 'snooze-alert'];

  public constructor(options: IRushAlertsOptions) {
    this._terminal = options.terminal;
    this._rushJsonFolder = options.rushJsonFolder;
    this.rushAlertsStateFilePath = options.rushAlertsStateFilePath;
    this.rushAlertsConfigFilePath = options.rushAlertsConfigFilePath;
    this._rushAlertsConfig = options.rushAlertsConfig;
    this._rushAlertsState = options.rushAlertsState;
  }

  public static async loadFromConfigurationAsync(
    rushConfiguration: RushConfiguration,
    terminal: Terminal
  ): Promise<RushAlerts> {
    const rushAlertsStateFilePath: string = `${rushConfiguration.commonTempFolder}/${RushConstants.rushAlertsConfigFilename}`;
    const rushAlertsConfigFilePath: string = `${rushConfiguration.commonRushConfigFolder}/${RushConstants.rushAlertsConfigFilename}`;
    const rushJsonFolder: string = rushConfiguration.rushJsonFolder;

    const [isRushAlertsStateFileExists, isRushAlertsConfigFileExists] = await Promise.all([
      FileSystem.existsAsync(rushAlertsStateFilePath),
      FileSystem.existsAsync(rushAlertsConfigFilePath)
    ]);

    const [rushAlertsConfig, rushAlertsState] = await Promise.all([
      isRushAlertsConfigFileExists
        ? JsonFile.loadAndValidateAsync(
            rushAlertsConfigFilePath,
            JsonSchema.fromLoadedObject(rushAlertsSchemaJson)
          )
        : undefined,
      isRushAlertsStateFileExists
        ? JsonFile.loadAsync(rushAlertsStateFilePath, { jsonSyntax: JsonSyntax.JsonWithComments })
        : undefined
    ]);

    return new RushAlerts({
      terminal,
      rushAlertsStateFilePath,
      rushAlertsConfigFilePath,
      rushJsonFolder,
      rushAlertsConfig,
      rushAlertsState
    });
  }

  public async isAlertsStateUpToDateAsync(): Promise<boolean> {
    if (this._rushAlertsState === undefined || !this._rushAlertsState.lastUpdateTime) {
      return false;
    }

    const currentTime: Date = new Date();
    const lastUpdateTime: Date = new Date(this._rushAlertsState.lastUpdateTime);

    const hours: number = (Number(currentTime) - Number(lastUpdateTime)) / (1000 * 60 * 60);

    if (hours > 24) {
      return false;
    }

    return true;
  }

  public async retrieveAlertsAsync(): Promise<void> {
    if (this._rushAlertsConfig) {
      const validAlerts: Array<IRushAlertStateEntry> = [];
      if (this._rushAlertsConfig?.alerts.length !== 0) {
        for (const alert of this._rushAlertsConfig.alerts) {
          if (await this._isAlertValidAsync(alert)) {
            validAlerts.push({
              title: alert.title,
              message: alert.message,
              detailsUrl: alert.detailsUrl,
              priority: alert.priority,
              maximumDisplayInterval: alert.maximumDisplayInterval
            });
          }
        }
      }

      const rushAlertsState: IRushAlertsState = {
        lastUpdateTime: new Date().toISOString(),
        snooze: false,
        alerts: validAlerts
      };

      await this._writeRushAlertStateAsync(rushAlertsState);
    }
  }

  public async printAlertsAsync(): Promise<void> {
    if (!this._rushAlertsState || this._rushAlertsState.alerts.length === 0) {
      return;
    }

    // Skip printing alerts when the user has chosen to snooze them.
    if (this._isSnoozing()) {
      return;
    }

    this._terminal.writeLine();

    const alert: IRushAlertStateEntry | undefined = this._selectAlertByPriority(this._rushAlertsState.alerts);

    if (alert) {
      this._printMessageInBoxStyle(alert);
      alert.lastDisplayTime = new Date().toISOString();
    }

    await this._writeRushAlertStateAsync(this._rushAlertsState);
  }

  public async printAllAlertsAsync(): Promise<void> {
    const alertsConfig = this._rushAlertsConfig?.alerts ?? [];
    const alertsState = this._rushAlertsState?.alerts ?? [];

    const allAlerts = alertsConfig.map((alert, index) => ({ title: alert.title, index }));
    const activeAlertsSet = new Set(this._isSnoozing() ? [] : alertsState.map((alert) => alert.title));

    const activeAlerts = allAlerts.filter(({ title }) => activeAlertsSet.has(title));
    const inactiveAlerts = allAlerts.filter(({ title }) => !activeAlertsSet.has(title));

    this._printAlerts(activeAlerts, 'active');
    this._printAlerts(inactiveAlerts, 'inactive');
  }

  private _printAlerts(alerts: { title: string; index: number }[], status: string): void {
    if (alerts.length === 0) return;

    const statusText = status === 'active' ? 'active' : 'inactive';
    this._terminal.writeLine(Colorize.yellow(`The following alerts are currently ${statusText}:`));

    alerts.forEach(({ title, index }) => {
      this._terminal.writeLine(Colorize.green(`"${title}" (#${index + 1})`));
    });
    this._terminal.writeLine();
  }

  public async snoozeAlertsAsync(choice: string): Promise<void> {
    if (!this._rushAlertsState || this._rushAlertsState.alerts.length === 0) {
      return;
    }
    switch (choice) {
      case AlertChoice.SHOW_ALERTS: {
        this._rushAlertsState.snooze = false;
        break;
      }
      case AlertChoice.NEVER_SHOW_ALERTS: {
        this._rushAlertsState.snooze = true;
        break;
      }
      case AlertChoice.DO_NOT_SHOW_THIS_WEEK: {
        this._rushAlertsState.snooze = true;
        const snoozeEndTime: Date = new Date();
        snoozeEndTime.setDate(snoozeEndTime.getDate() + 7);
        this._rushAlertsState.snoozeEndTime = snoozeEndTime.toISOString();
        break;
      }
    }
    await this._writeRushAlertStateAsync(this._rushAlertsState);
  }

  private _selectAlertByPriority(alerts: IRushAlertStateEntry[]): IRushAlertStateEntry | undefined {
    const needDisplayAlerts: IRushAlertStateEntry[] = alerts.filter((alert) => {
      const needsDisplay: boolean =
        !alert.lastDisplayTime ||
        Number(new Date()) - Number(new Date(alert.lastDisplayTime)) >
          RushAlerts.alertDisplayIntervalDurations.get(
            alert.maximumDisplayInterval ?? AlertDisplayInterval.ALWAYS
          )!;
      return needsDisplay;
    });
    const alertsSortedByPriority: IRushAlertStateEntry[] = needDisplayAlerts.sort((a, b) => {
      return (
        RushAlerts.ALERT_PRIORITY.indexOf(a.priority ?? AlertPriority.NORMAL) -
        RushAlerts.ALERT_PRIORITY.indexOf(b.priority ?? AlertPriority.NORMAL)
      );
    });
    return alertsSortedByPriority[0];
  }

  private static _parseDate(dateString: string): Date {
    const parsedDate: Date = new Date(dateString);
    if (isNaN(parsedDate.getTime())) {
      throw new Error(`Invalid date/time value ${JSON.stringify(dateString)}`);
    }
    return parsedDate;
  }

  private _isSnoozing(): boolean {
    if (!this._rushAlertsState) {
      return true;
    }

    return (
      this._rushAlertsState.snooze &&
      (!this._rushAlertsState.snoozeEndTime ||
        Number(new Date()) < Number(new Date(this._rushAlertsState.snoozeEndTime)))
    );
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
      const conditionScriptPath: string = `${this._rushJsonFolder}/common/config/rush/alert-scripts/${conditionScript}`;
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
        process.chdir(this._rushJsonFolder);
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
    this._terminal.writeLine('To stop seeing this event, run "rush snooze-alert"');
  }

  private async _writeRushAlertStateAsync(rushAlertsState: IRushAlertsState): Promise<void> {
    if (rushAlertsState.alerts.length > 0) {
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
