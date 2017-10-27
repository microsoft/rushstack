// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fsx from 'fs-extra';
import * as os from 'os';
import * as colors from 'colors';

import {
  Stopwatch,
  Event
} from '../../index';

import {
  CustomOption,
  ICustomEnumValue
} from '../../data/CommandLineConfiguration';

import {
  CommandLineFlagParameter,
  CommandLineIntegerParameter,
  CommandLineStringListParameter,
  CommandLineOptionParameter,
  ICommandLineActionOptions
} from '@microsoft/ts-command-line';

import RushCommandLineParser from './RushCommandLineParser';
import { BaseRushAction } from './BaseRushAction';
import { TaskManager } from '../utilities/TaskManager';

interface ICustomOptionInstance {
  optionDefinition: CustomOption;
  parameterValue?: CommandLineFlagParameter | CommandLineOptionParameter;
}

export class CustomRushAction extends BaseRushAction {
  private customOptions: Map<string, ICustomOptionInstance> = new Map<string, ICustomOptionInstance>();

  private _fromFlag: CommandLineStringListParameter;
  private _toFlag: CommandLineStringListParameter;
  private _verboseParameter: CommandLineFlagParameter;
  private _parallelismParameter: CommandLineIntegerParameter;

  private _parser: RushCommandLineParser;

  constructor(parser: RushCommandLineParser, options: ICommandLineActionOptions) {
    super(options);
    this._parser = parser;
  }

  public addCustomOption(longName: string, option: CustomOption): void {
    if (this.customOptions.get(longName)) {
      throw new Error(`Cannot define two custom options with the same name: "${longName}"`);
    }
    this.customOptions.set(longName, {
      optionDefinition: option
    });
  }

  public run(): void {
    if (!fsx.existsSync(this.rushConfiguration.rushLinkJsonFilename)) {
      throw new Error(`File not found: ${this.rushConfiguration.rushLinkJsonFilename}` +
        `${os.EOL}Did you run "rush link"?`);
    }
    this.eventHooksManager.handle(Event.preRushBuild);

    const stopwatch: Stopwatch = Stopwatch.start();

    const isQuietMode: boolean = !(this._verboseParameter.value);

    // collect all custom flags here
    const customFlags: string[] = [];
    this.customOptions.forEach((customOption: ICustomOptionInstance, longName: string) => {
      if (customOption.parameterValue!.value) {
        if (customOption.optionDefinition.optionType === 'flag') {
          customFlags.push(longName);
        } else if (customOption.optionDefinition.optionType === 'enum') {
          customFlags.push(`${longName}=${customOption.parameterValue!.value}`);
        }
      }
    });

    const tasks: TaskManager = new TaskManager(
      this._parser.rushConfig,
      this._toFlag.value,
      this._fromFlag.value,
      this.options.actionVerb,
      customFlags,
      isQuietMode,
      this._parallelismParameter.value,
      this.options.actionVerb === 'build'
    );

    tasks.execute().then(
      () => {
        stopwatch.stop();
        console.log(colors.green(`rush ${this.options.actionVerb} (${stopwatch.toString()})`));
        this._collectTelemetry(stopwatch, true);
        this._parser.flushTelemetry();
        this.eventHooksManager.handle(Event.postRushBuild, this._parser.isDebug);
      },
      () => {
        stopwatch.stop();
        console.log(colors.red(`rush ${this.options.actionVerb} - Errors! (${stopwatch.toString()})`));
        this._collectTelemetry(stopwatch, false);
        this._parser.flushTelemetry();
        this.eventHooksManager.handle(Event.postRushBuild, this._parser.isDebug);
        this._parser.exitWithError();
      });
  }

  protected onDefineParameters(): void {
    this._parallelismParameter = this.defineIntegerParameter({
      parameterLongName: '--parallelism',
      parameterShortName: '-p',
      key: 'COUNT',
      description: 'Change limit the number of simultaneous builds. This value defaults to the number of CPU cores'
    });
    this._toFlag = this.defineStringListParameter({
      parameterLongName: '--to',
      parameterShortName: '-t',
      key: 'PROJECT1',
      description: 'Build the specified project and all of its dependencies'
    });
    this._fromFlag = this.defineStringListParameter({
      parameterLongName: '--from',
      parameterShortName: '-f',
      key: 'PROJECT2',
      description: 'Build all projects that directly or indirectly depend on the specified project'
    });
    this._verboseParameter = this.defineFlagParameter({
      parameterLongName: '--verbose',
      parameterShortName: '-v',
      description: 'Display the logs during the build, rather than just displaying the build status summary'
    });

    // @TODO we should throw if they are trying to overwrite built in flags

    this.customOptions.forEach((customOption: ICustomOptionInstance, longName: string) => {
      if (customOption.optionDefinition.optionType === 'flag') {
        customOption.parameterValue = this.defineFlagParameter({
          parameterShortName: customOption.optionDefinition.shortName,
          parameterLongName: longName,
          description: customOption.optionDefinition.description
        });
      } else if (customOption.optionDefinition.optionType === 'enum') {
        customOption.parameterValue = this.defineOptionParameter({
          parameterShortName: customOption.optionDefinition.shortName,
          parameterLongName: longName,
          description: customOption.optionDefinition.description,
          defaultValue: customOption.optionDefinition.defaultValue,
          options: customOption.optionDefinition.enumValues.map((enumValue: ICustomEnumValue) => {
              return enumValue.name;
            })
        });
      }
    });
  }

  private _collectTelemetry(stopwatch: Stopwatch, success: boolean): void {
    const extraData: { [key: string]: string } = {
      command_to: (!!this._toFlag.value).toString(),
      command_from: (!!this._fromFlag.value).toString()
    };

    this.customOptions.forEach((customOption: ICustomOptionInstance, longName: string) => {
      if (customOption.parameterValue!.value) {
        extraData[`${this.options.actionVerb}_${longName}`] =
          customOption.parameterValue!.value.toString();
      }
    });

    this._parser.telemetry.log({
      name: this.options.actionVerb,
      duration: stopwatch.duration,
      result: success ? 'Succeeded' : 'Failed',
      extraData
    });
  }
}