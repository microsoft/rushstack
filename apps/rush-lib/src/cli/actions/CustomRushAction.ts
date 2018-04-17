// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fsx from 'fs-extra';
import * as os from 'os';
import * as colors from 'colors';

import {
  Event
} from '../../index';

import {
  CustomOption,
  ICustomEnumValue
} from '../../data/CommandLineConfiguration';

import {
  CommandLineFlagParameter,
  CommandLineStringParameter,
  CommandLineStringListParameter,
  CommandLineChoiceParameter,
  ICommandLineActionOptions
} from '@microsoft/ts-command-line';

import RushCommandLineParser from './RushCommandLineParser';
import { BaseRushAction } from './BaseRushAction';
import { TaskSelector } from '../logic/TaskSelector';
import { Stopwatch } from '../../utilities/Stopwatch';

interface ICustomOptionInstance {
  optionDefinition: CustomOption;
  parameterValue?: CommandLineFlagParameter | CommandLineChoiceParameter;
}

export class CustomRushAction extends BaseRushAction {
  private customOptions: Map<string, ICustomOptionInstance> = new Map<string, ICustomOptionInstance>();

  private _changedProjectsOnly: CommandLineFlagParameter;
  private _fromFlag: CommandLineStringListParameter;
  private _toFlag: CommandLineStringListParameter;
  private _verboseParameter: CommandLineFlagParameter;
  private _parallelismParameter: CommandLineStringParameter | undefined;

  constructor(
    parser: RushCommandLineParser,
    options: ICommandLineActionOptions,
    private _parallelized: boolean = false,
    private _ignoreMissingScript: boolean = false
  ) {
    super({
      ...options,
      parser
    });
  }

  /**
   * Registers a custom option to a task. This custom option is then registered during onDefineParameters()
   * @param longName the long name of the option, e.g. "--verbose"
   * @param option the Custom Option definition
   */
  public addCustomOption(longName: string, option: CustomOption): void {
    if (this.customOptions.get(longName)) {
      throw new Error(`Cannot define two custom options with the same name: "${longName}"`);
    }
    this.customOptions.set(longName, {
      optionDefinition: option
    });
  }

  public run(): Promise<void> {
    if (!fsx.existsSync(this.rushConfiguration.rushLinkJsonFilename)) {
      throw new Error(`File not found: ${this.rushConfiguration.rushLinkJsonFilename}` +
        `${os.EOL}Did you run "rush link"?`);
    }
    this._doBeforeTask();

    const stopwatch: Stopwatch = Stopwatch.start();

    const isQuietMode: boolean = !(this._verboseParameter.value);

    // if this is parallizable, then use the value from the flag (undefined or a number),
    // if this is not parallelized, then use 1 core
    const parallelism: string | undefined = this._isParallelized()
      ? this._parallelismParameter!.value
      : '1';

    // collect all custom flags here
    const customFlags: string[] = [];
    this.customOptions.forEach((customOption: ICustomOptionInstance, longName: string) => {
      if (customOption.parameterValue!.value) {
        if (customOption.optionDefinition.optionType === 'flag') {
          customFlags.push(longName);
        } else if (customOption.optionDefinition.optionType === 'enum') {
          customFlags.push(`${longName} ${customOption.parameterValue!.value}`);
        }
      }
    });

    const changedProjectsOnly: boolean = this.options.actionVerb === 'build' && this._changedProjectsOnly.value;

    const tasks: TaskSelector = new TaskSelector(
      {
        rushConfiguration: this.parser.rushConfiguration,
        toFlags: this._toFlag.values,
        fromFlags: this._fromFlag.values,
        commandToRun: this.options.actionVerb,
        customFlags,
        isQuietMode,
        parallelism,
        isIncrementalBuildAllowed: this.options.actionVerb === 'build',
        changedProjectsOnly,
        ignoreMissingScript: this._ignoreMissingScript
      }
    );

    return tasks.execute().then(
      () => {
        stopwatch.stop();
        console.log(colors.green(`rush ${this.options.actionVerb} (${stopwatch.toString()})`));
        this._doAfterTask(stopwatch, true);
      },
      () => {
        stopwatch.stop();
        console.log(colors.red(`rush ${this.options.actionVerb} - Errors! (${stopwatch.toString()})`));
        this._doAfterTask(stopwatch, false);
        this.parser.exitWithError();
      });
  }

  protected onDefineParameters(): void {
    if (this._isParallelized()) {
      this._parallelismParameter = this.defineStringParameter({
        parameterLongName: '--parallelism',
        parameterShortName: '-p',
        argumentName: 'COUNT',
        description: 'Specify the number of concurrent build processes'
          + ' The value "max" can be specified to indicate the number of CPU cores.'
          + ' If this parameter omitted, the default value depends on the operating system and number of CPU cores.'
      });
    }
    this._toFlag = this.defineStringListParameter({
      parameterLongName: '--to',
      parameterShortName: '-t',
      argumentName: 'PROJECT1',
      description: 'Run command in the specified project and all of its dependencies'
    });
    this._fromFlag = this.defineStringListParameter({
      parameterLongName: '--from',
      parameterShortName: '-f',
      argumentName: 'PROJECT2',
      description: 'Run command in all projects that directly or indirectly depend on the specified project'
    });
    this._verboseParameter = this.defineFlagParameter({
      parameterLongName: '--verbose',
      parameterShortName: '-v',
      description: 'Display the logs during the build, rather than just displaying the build status summary'
    });
    if (this.options.actionVerb === 'build') {
      this._changedProjectsOnly = this.defineFlagParameter({
        parameterLongName: '--changed-projects-only',
        parameterShortName: '-o',
        description: 'If specified, the incremental build will only rebuild projects that have changed, '
          + 'but not any projects that directly or indirectly depend on the changed package.'
      });
    }

    // @TODO we should throw if they are trying to overwrite built in flags

    this.customOptions.forEach((customOption: ICustomOptionInstance, longName: string) => {
      if (customOption.optionDefinition.optionType === 'flag') {
        customOption.parameterValue = this.defineFlagParameter({
          parameterShortName: customOption.optionDefinition.shortName,
          parameterLongName: longName,
          description: customOption.optionDefinition.description
        });
      } else if (customOption.optionDefinition.optionType === 'enum') {
        customOption.parameterValue = this.defineChoiceParameter({
          parameterShortName: customOption.optionDefinition.shortName,
          parameterLongName: longName,
          description: customOption.optionDefinition.description,
          defaultValue: customOption.optionDefinition.defaultValue,
          alternatives: customOption.optionDefinition.enumValues.map((enumValue: ICustomEnumValue) => {
              return enumValue.name;
            })
        });
      }
    });
  }

  private _isParallelized(): boolean {
    return this.options.actionVerb === 'build'
      || this.options.actionVerb === 'rebuild'
      || this._parallelized;
  }

  private _doBeforeTask(): void {
    if (this.options.actionVerb !== 'build' && this.options.actionVerb !== 'rebuild') {
      // Only collects information for built-in tasks like build or rebuild.
      return;
    }

    this.eventHooksManager.handle(Event.preRushBuild);
  }

  private _doAfterTask(stopwatch: Stopwatch, success: boolean): void {
    if (this.options.actionVerb !== 'build' && this.options.actionVerb !== 'rebuild') {
      // Only collects information for built-in tasks like build or rebuild.
      return;
    }
    this._collectTelemetry(stopwatch, success);
    this.parser.flushTelemetry();
    this.eventHooksManager.handle(Event.postRushBuild, this.parser.isDebug);
  }

  private _collectTelemetry(stopwatch: Stopwatch, success: boolean): void {
    const extraData: { [key: string]: string } = {
      command_to: (!!this._toFlag.values).toString(),
      command_from: (!!this._fromFlag.values).toString()
    };

    this.customOptions.forEach((customOption: ICustomOptionInstance, longName: string) => {
      if (customOption.parameterValue!.value) {
        extraData[`${this.options.actionVerb}_${longName}`] =
          customOption.parameterValue!.value!.toString();
      }
    });

    if (this.parser.telemetry) {
      this.parser.telemetry.log({
        name: this.options.actionVerb,
        duration: stopwatch.duration,
        result: success ? 'Succeeded' : 'Failed',
        extraData
      });
    }
  }
}