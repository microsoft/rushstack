// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fsx from 'fs-extra';
import * as os from 'os';
import * as colors from 'colors';

import {
  Event
} from '../../index';

import {
  CommandLineParameter,
  CommandLineFlagParameter,
  CommandLineStringParameter,
  CommandLineStringListParameter
} from '@microsoft/ts-command-line';

import { BaseRushAction, IRushCommandLineActionOptions } from './BaseRushAction';
import { SetupChecks } from '../logic/SetupChecks';
import { TaskSelector } from '../logic/TaskSelector';
import { Stopwatch } from '../../utilities/Stopwatch';
import { AlreadyReportedError } from '../../utilities/AlreadyReportedError';
import { CommandLineConfiguration } from '../../data/CommandLineConfiguration';
import { ParameterJson } from '../../data/CommandLineJson';
import { RushConstants } from '../../RushConstants';

export interface ICustomRushActionOptions extends IRushCommandLineActionOptions {
  enableParallelism: boolean;
  ignoreMissingScript: boolean;
  commandLineConfiguration: CommandLineConfiguration;
}

export class CustomRushAction extends BaseRushAction {
  private _enableParallelism: boolean;
  private _ignoreMissingScript: boolean;
  private _commandLineConfiguration: CommandLineConfiguration;

  private _changedProjectsOnly: CommandLineFlagParameter;
  private _fromFlag: CommandLineStringListParameter;
  private _toFlag: CommandLineStringListParameter;
  private _toVersionPolicy: CommandLineStringListParameter;
  private _verboseParameter: CommandLineFlagParameter;
  private _parallelismParameter: CommandLineStringParameter | undefined;

  private _customParameters: CommandLineParameter[] = [];

  constructor(
    options: ICustomRushActionOptions
  ) {
    super(options);
    this._enableParallelism = options.enableParallelism;
    this._ignoreMissingScript = options.ignoreMissingScript;
    this._commandLineConfiguration = options.commandLineConfiguration;
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
    // if parallelism is not enabled, then restrict to 1 core
    const parallelism: string | undefined = this._isParallelismEnabled()
      ? this._parallelismParameter!.value
      : '1';

    // Collect all custom parameter values
    const customParameterValues: string[] = [];

    for (const customParameter of this._customParameters) {
      customParameter.appendToArgList(customParameterValues);
    }

    const changedProjectsOnly: boolean = this.actionName === 'build' && this._changedProjectsOnly.value;

    const tasks: TaskSelector = new TaskSelector(
      {
        rushConfiguration: this.rushConfiguration,
        toFlags: this._mergeToProjects(),
        fromFlags: this._fromFlag.values,
        commandToRun: this.actionName,
        customParameterValues,
        isQuietMode,
        parallelism,
        isIncrementalBuildAllowed: this.actionName === 'build',
        changedProjectsOnly,
        ignoreMissingScript: this._ignoreMissingScript
      }
    );

    return tasks.execute().then(
      () => {
        stopwatch.stop();
        console.log(colors.green(`rush ${this.actionName} (${stopwatch.toString()})`));
        this._doAfterTask(stopwatch, true);
      })
      .catch((error: Error) => {
        if (error && error.message) {
          console.log('Error: ' + error.message);
        }
        stopwatch.stop();
        console.log(colors.red(`rush ${this.actionName} - Errors! (${stopwatch.toString()})`));
        this._doAfterTask(stopwatch, false);
        throw new AlreadyReportedError();
      });
  }

  protected onDefineParameters(): void {
    if (this._isParallelismEnabled()) {
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
    this._toVersionPolicy =  this.defineStringListParameter({
      parameterLongName: '--to-version-policy',
      argumentName: 'VERSION_POLICY_NAME',
      description: 'Run command in all projects with the specified version policy and all of their dependencies'
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
    if (this.actionName === 'build') {
      this._changedProjectsOnly = this.defineFlagParameter({
        parameterLongName: '--changed-projects-only',
        parameterShortName: '-o',
        description: 'If specified, the incremental build will only rebuild projects that have changed, '
          + 'but not any projects that directly or indirectly depend on the changed package.'
      });
    }

    // Find any parameters that are associated with this command
    for (const parameter of this._commandLineConfiguration.parameters) {
      let associated: boolean = false;
      for (const associatedCommand of parameter.associatedCommands) {
        if (associatedCommand === this.actionName) {
          associated = true;
        }
      }

      if (associated) {
        let customParameter: CommandLineParameter | undefined;

        switch (parameter.parameterKind) {
          case 'flag':
            customParameter = this.defineFlagParameter({
              parameterShortName: parameter.shortName,
              parameterLongName: parameter.longName,
              description: parameter.description
            });
            break;
          case 'choice':
           customParameter = this.defineChoiceParameter({
              parameterShortName: parameter.shortName,
              parameterLongName: parameter.longName,
              description: parameter.description,
              alternatives: parameter.alternatives.map(x => x.name),
              defaultValue: parameter.defaultValue
            });
            break;
          default:
            throw new Error(`${RushConstants.commandLineFilename} defines a parameter "${parameter!.longName}"`
              + ` using an unsupported parameter kind "${parameter!.parameterKind}"`);
        }
        if (customParameter) {
          this._customParameters.push(customParameter);
        }
      }
    }
  }

  private _mergeToProjects(): string[] {
    const projects: string[] = [...this._toFlag.values];
    if (this._toVersionPolicy.values && this._toVersionPolicy.values.length) {
      this.rushConfiguration.projects.forEach(project => {
        const matches: boolean = this._toVersionPolicy.values.some(policyName => {
          return project.versionPolicyName === policyName;
        });
        if (matches) {
          projects.push(project.packageName);
        }
      });
    }
    return projects;
  }

  private _isParallelismEnabled(): boolean {
    return this.actionName === 'build'
      || this.actionName === 'rebuild'
      || this._enableParallelism;
  }

  private _doBeforeTask(): void {
    if (this.actionName !== 'build' && this.actionName !== 'rebuild') {
      // Only collects information for built-in tasks like build or rebuild.
      return;
    }

    SetupChecks.validate(this.rushConfiguration);

    this.eventHooksManager.handle(Event.preRushBuild, this.parser.isDebug);
  }

  private _doAfterTask(stopwatch: Stopwatch, success: boolean): void {
    if (this.actionName !== 'build' && this.actionName !== 'rebuild') {
      // Only collects information for built-in tasks like build or rebuild.
      return;
    }
    this._collectTelemetry(stopwatch, success);
    this.parser.flushTelemetry();
    this.eventHooksManager.handle(Event.postRushBuild, this.parser.isDebug);
  }

  private _collectTelemetry(stopwatch: Stopwatch, success: boolean): void {

    const customParameterValues: string[] = [];
    for (const customParameter of this._customParameters) {
      customParameter.appendToArgList(customParameterValues);
    }

    const extraData: { [key: string]: string } = {
      command_to: (this._toFlag.values.length > 0).toString(),
      command_from: (this._fromFlag.values.length > 0).toString(),
      customParameters: customParameterValues.join(' ')
    };

    if (this.parser.telemetry) {
      this.parser.telemetry.log({
        name: this.actionName,
        duration: stopwatch.duration,
        result: success ? 'Succeeded' : 'Failed',
        extraData
      });
    }
  }
}