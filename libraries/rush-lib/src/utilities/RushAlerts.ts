// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Colorize, PrintUtilities, type ITerminal } from '@rushstack/terminal';
import { FileSystem, JsonFile, JsonSchema, JsonSyntax } from '@rushstack/node-core-library';

import type { RushConfiguration } from '../api/RushConfiguration.ts';
import rushAlertsSchemaJson from '../schemas/rush-alerts.schema.json';
import { RushConstants } from '../logic/RushConstants.ts';
import { PURGE_ACTION_NAME } from './actionNameConstants.ts';

export interface IRushAlertsOptions {
  terminal: ITerminal;
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
  alertId: string;
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
  [alertId: string]: IRushAlertStateEntry;
}
interface IRushAlertStateEntry {
  lastDisplayTime?: string;
  snooze?: boolean;
  snoozeEndTime?: string;
}

type AlertStatus = 'active' | 'inactive' | 'snoozed';

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
  private readonly _terminal: ITerminal;

  private readonly _rushAlertsConfig: IRushAlertsConfig | undefined;
  private readonly _rushAlertsState: IRushAlertsState;

  private readonly _rushJsonFolder: string;
  public readonly rushAlertsStateFilePath: string;
  public readonly rushAlertsConfigFilePath: string;

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
  // only display alerts when certain specific actions are triggered
  public static readonly alertTriggerActions: string[] = [
    // TODO: put the rest of the action names in constants
    'add',
    'change',
    'deploy',
    'init',
    'publish',
    PURGE_ACTION_NAME,
    'remove',
    'update',
    'install',
    'build',
    'list',
    'version'
  ];

  public constructor(options: IRushAlertsOptions) {
    this._terminal = options.terminal;
    this._rushJsonFolder = options.rushJsonFolder;
    this.rushAlertsStateFilePath = options.rushAlertsStateFilePath;
    this.rushAlertsConfigFilePath = options.rushAlertsConfigFilePath;
    this._rushAlertsConfig = options.rushAlertsConfig;
    this._rushAlertsState = options.rushAlertsState ?? {};
  }

  public static async loadFromConfigurationAsync(
    rushConfiguration: RushConfiguration,
    terminal: ITerminal
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

  private _ensureAlertStateIsUpToDate(): void {
    // ensure `temp/rush-alerts.json` is up to date
    if (this._rushAlertsConfig) {
      for (const alert of this._rushAlertsConfig.alerts) {
        if (!(alert.alertId in this._rushAlertsState)) {
          this._rushAlertsState[alert.alertId] = {
            snooze: false
          };
        }
      }
    }
  }

  public async printAlertsAsync(): Promise<void> {
    if (!this._rushAlertsConfig || this._rushAlertsConfig.alerts.length === 0) return;

    this._ensureAlertStateIsUpToDate();

    this._terminal.writeLine();

    const alert: IRushAlertsConfigEntry | undefined = await this._selectAlertByPriorityAsync();
    if (alert) {
      this._printMessageInBoxStyle(alert);
      this._rushAlertsState[alert.alertId].lastDisplayTime = new Date().toISOString();
    }

    await this._writeRushAlertStateAsync();
  }

  public async printAllAlertsAsync(): Promise<void> {
    const allAlerts: IRushAlertsConfigEntry[] = this._rushAlertsConfig?.alerts ?? [];

    const activeAlerts: IRushAlertsConfigEntry[] = [];
    const snoozedAlerts: IRushAlertsConfigEntry[] = [];
    const inactiveAlerts: IRushAlertsConfigEntry[] = [];

    await Promise.all(
      allAlerts.map(async (alert) => {
        const isAlertValid: boolean = await this._isAlertValidAsync(alert);
        const alertState: IRushAlertStateEntry = this._rushAlertsState[alert.alertId];

        if (!isAlertValid) {
          inactiveAlerts.push(alert);
          return;
        }

        if (this._isSnoozing(alertState)) {
          snoozedAlerts.push(alert);
          return;
        }

        activeAlerts.push(alert);
      })
    );

    this._printAlerts(activeAlerts, 'active');
    this._printAlerts(snoozedAlerts, 'snoozed');
    this._printAlerts(inactiveAlerts, 'inactive');
  }

  private _printAlerts(alerts: IRushAlertsConfigEntry[], status: AlertStatus): void {
    if (alerts.length === 0) return;
    switch (status) {
      case 'active':
      case 'inactive':
        this._terminal.writeLine(Colorize.yellow(`The following alerts are currently ${status}:`));
        break;
      case 'snoozed':
        this._terminal.writeLine(Colorize.yellow('The following alerts are currently active but snoozed:'));
        break;
    }
    alerts.forEach(({ title }) => {
      this._terminal.writeLine(Colorize.green(`"${title}"`));
    });
    this._terminal.writeLine();
  }

  public async snoozeAlertsByAlertIdAsync(alertId: string, forever: boolean = false): Promise<void> {
    this._ensureAlertStateIsUpToDate();
    if (forever) {
      this._rushAlertsState[alertId].snooze = true;
    } else {
      this._rushAlertsState[alertId].snooze = true;
      const snoozeEndTime: Date = new Date();
      snoozeEndTime.setDate(snoozeEndTime.getDate() + 7);
      this._rushAlertsState[alertId].snoozeEndTime = snoozeEndTime.toISOString();
    }
    await this._writeRushAlertStateAsync();
  }

  private async _selectAlertByPriorityAsync(): Promise<IRushAlertsConfigEntry | undefined> {
    const alerts: Array<IRushAlertsConfigEntry> = this._rushAlertsConfig!.alerts;
    const alertsState: IRushAlertsState = this._rushAlertsState;

    const needDisplayAlerts: Array<IRushAlertsConfigEntry> = (
      await Promise.all(
        alerts.map(async (alert) => {
          const isAlertValid: boolean = await this._isAlertValidAsync(alert);
          const alertState: IRushAlertStateEntry = alertsState[alert.alertId];
          if (
            isAlertValid &&
            !this._isSnoozing(alertState) &&
            (!alertState.lastDisplayTime ||
              Number(new Date()) - Number(new Date(alertState.lastDisplayTime)) >
                RushAlerts.alertDisplayIntervalDurations.get(
                  alert.maximumDisplayInterval ?? AlertDisplayInterval.ALWAYS
                )!)
          ) {
            return alert;
          }
        })
      )
    ).filter((alert) => alert !== undefined) as Array<IRushAlertsConfigEntry>;

    const alertsSortedByPriority: IRushAlertsConfigEntry[] = needDisplayAlerts.sort((a, b) => {
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

  private _isSnoozing(alertState: IRushAlertStateEntry): boolean {
    return (
      Boolean(alertState.snooze) &&
      (!alertState.snoozeEndTime || Number(new Date()) < Number(new Date(alertState.snoozeEndTime)))
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

  private _printMessageInBoxStyle(alert: IRushAlertsConfigEntry): void {
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
    this._terminal.writeLine(`To stop seeing this alert, run "rush alert --snooze ${alert.alertId}"`);
  }

  private async _writeRushAlertStateAsync(): Promise<void> {
    await JsonFile.saveAsync(this._rushAlertsState, this.rushAlertsStateFilePath, {
      ignoreUndefinedValues: true,
      headerComment: '// THIS FILE IS MACHINE-GENERATED -- DO NOT MODIFY',
      jsonSyntax: JsonSyntax.JsonWithComments
    });
  }
}
