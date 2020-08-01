// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

console.log('BulkScriptAction.ts  : 1: ' + (new Date().getTime() % 20000) / 1000.0);
import * as os from 'os';
console.log('BulkScriptAction.ts  : 2: ' + (new Date().getTime() % 20000) / 1000.0);
import * as colors from 'colors';
console.log('BulkScriptAction.ts  : 3: ' + (new Date().getTime() % 20000) / 1000.0);

import {
  CommandLineFlagParameter,
  CommandLineStringParameter,
  CommandLineStringListParameter,
  CommandLineParameterKind
} from '@rushstack/ts-command-line';

console.log('BulkScriptAction.ts  : 4: ' + (new Date().getTime() % 20000) / 1000.0);
import { Event } from '../../index';
console.log('BulkScriptAction.ts  : 5: ' + (new Date().getTime() % 20000) / 1000.0);
import { SetupChecks } from '../../logic/SetupChecks';
console.log('BulkScriptAction.ts  : 6: ' + (new Date().getTime() % 20000) / 1000.0);
import { TaskSelector } from '../../logic/TaskSelector';
console.log('BulkScriptAction.ts  : 7: ' + (new Date().getTime() % 20000) / 1000.0);
import { Stopwatch } from '../../utilities/Stopwatch';
console.log('BulkScriptAction.ts  : 8: ' + (new Date().getTime() % 20000) / 1000.0);
import { AlreadyReportedError } from '../../utilities/AlreadyReportedError';
console.log('BulkScriptAction.ts  : 9: ' + (new Date().getTime() % 20000) / 1000.0);
import { BaseScriptAction, IBaseScriptActionOptions } from './BaseScriptAction';
console.log('BulkScriptAction.ts  : 10: ' + (new Date().getTime() % 20000) / 1000.0);
import { TaskRunner } from '../../logic/taskRunner/TaskRunner';
console.log('BulkScriptAction.ts  : 11: ' + (new Date().getTime() % 20000) / 1000.0);
import { TaskCollection } from '../../logic/taskRunner/TaskCollection';
console.log('BulkScriptAction.ts  : 12: ' + (new Date().getTime() % 20000) / 1000.0);
import { Utilities } from '../../utilities/Utilities';
console.log('BulkScriptAction.ts  : 13: ' + (new Date().getTime() % 20000) / 1000.0);
import { RushConstants } from '../../logic/RushConstants';
console.log('BulkScriptAction.ts  : 14: ' + (new Date().getTime() % 20000) / 1000.0);
import { EnvironmentVariableNames } from '../../api/EnvironmentConfiguration';
console.log('BulkScriptAction.ts  : 15: ' + (new Date().getTime() % 20000) / 1000.0);
import { LastLinkFlag, LastLinkFlagFactory } from '../../api/LastLinkFlag';
console.log('BulkScriptAction.ts  : 16: ' + (new Date().getTime() % 20000) / 1000.0);

/**
 * Constructor parameters for BulkScriptAction.
 */
export interface IBulkScriptActionOptions extends IBaseScriptActionOptions {
  enableParallelism: boolean;
  ignoreMissingScript: boolean;
  ignoreDependencyOrder: boolean;
  incremental: boolean;
  allowWarningsInSuccessfulBuild: boolean;

  /**
   * Optional command to run. Otherwise, use the `actionName` as the command to run.
   */
  commandToRun?: string;
}

/**
 * This class implements bulk commands which are run individually for each project in the repo,
 * possibly in parallel.  The action executes a script found in the project's package.json file.
 *
 * @remarks
 * Bulk commands can be defined via common/config/command-line.json.  Rush's predefined "build"
 * and "rebuild" commands are also modeled as bulk commands, because they essentially just
 * execute scripts from package.json in the same as any custom command.
 */
export class BulkScriptAction extends BaseScriptAction {
  private _enableParallelism: boolean;
  private _ignoreMissingScript: boolean;
  private _isIncrementalBuildAllowed: boolean;
  private _commandToRun: string;

  private _changedProjectsOnly: CommandLineFlagParameter;
  private _fromFlag: CommandLineStringListParameter;
  private _toFlag: CommandLineStringListParameter;
  private _fromVersionPolicy: CommandLineStringListParameter;
  private _toVersionPolicy: CommandLineStringListParameter;
  private _verboseParameter: CommandLineFlagParameter;
  private _parallelismParameter: CommandLineStringParameter | undefined;
  private _ignoreDependencyOrder: boolean;
  private _allowWarningsInSuccessfulBuild: boolean;

  public constructor(options: IBulkScriptActionOptions) {
    super(options);
    this._enableParallelism = options.enableParallelism;
    this._ignoreMissingScript = options.ignoreMissingScript;
    this._isIncrementalBuildAllowed = options.incremental;
    this._commandToRun = options.commandToRun || options.actionName;
    this._ignoreDependencyOrder = options.ignoreDependencyOrder;
    this._allowWarningsInSuccessfulBuild = options.allowWarningsInSuccessfulBuild;
  }

  public runAsync(): Promise<void> {
    // TODO: Replace with last-install.flag when "rush link" and "rush unlink" are deprecated
    const lastLinkFlag: LastLinkFlag = LastLinkFlagFactory.getCommonTempFlag(this.rushConfiguration);
    if (!lastLinkFlag.isValid()) {
      const useWorkspaces: boolean =
        this.rushConfiguration.pnpmOptions && this.rushConfiguration.pnpmOptions.useWorkspaces;
      if (useWorkspaces) {
        throw new Error(`Link flag invalid.${os.EOL}Did you run "rush install" or "rush update"?`);
      } else {
        throw new Error(`Link flag invalid.${os.EOL}Did you run "rush link"?`);
      }
    }

    this._doBeforeTask();

    const stopwatch: Stopwatch = Stopwatch.start();

    const isQuietMode: boolean = !this._verboseParameter.value;

    // if this is parallelizable, then use the value from the flag (undefined or a number),
    // if parallelism is not enabled, then restrict to 1 core
    const parallelism: string | undefined = this._enableParallelism ? this._parallelismParameter!.value : '1';

    // Collect all custom parameter values
    const customParameterValues: string[] = [];
    for (const customParameter of this.customParameters) {
      customParameter.appendToArgList(customParameterValues);
    }

    const changedProjectsOnly: boolean = this._isIncrementalBuildAllowed && this._changedProjectsOnly.value;

    const taskSelector: TaskSelector = new TaskSelector({
      rushConfiguration: this.rushConfiguration,
      toProjects: this.mergeProjectsWithVersionPolicy(this._toFlag, this._toVersionPolicy),
      fromProjects: this.mergeProjectsWithVersionPolicy(this._fromFlag, this._fromVersionPolicy),
      commandToRun: this._commandToRun,
      customParameterValues,
      isQuietMode: isQuietMode,
      isIncrementalBuildAllowed: this._isIncrementalBuildAllowed,
      ignoreMissingScript: this._ignoreMissingScript,
      ignoreDependencyOrder: this._ignoreDependencyOrder,
      packageDepsFilename: Utilities.getPackageDepsFilenameForCommand(this._commandToRun)
    });

    // Register all tasks with the task collection
    const taskCollection: TaskCollection = taskSelector.registerTasks();

    const taskRunner: TaskRunner = new TaskRunner(taskCollection.getOrderedTasks(), {
      quietMode: isQuietMode,
      parallelism: parallelism,
      changedProjectsOnly: changedProjectsOnly,
      allowWarningsInSuccessfulBuild: this._allowWarningsInSuccessfulBuild
    });

    return taskRunner
      .execute()
      .then(() => {
        stopwatch.stop();
        console.log(colors.green(`rush ${this.actionName} (${stopwatch.toString()})`));
        this._doAfterTask(stopwatch, true);
      })
      .catch((error: Error) => {
        stopwatch.stop();
        if (error instanceof AlreadyReportedError) {
          console.log(colors.green(`rush ${this.actionName} (${stopwatch.toString()})`));
        } else {
          if (error && error.message) {
            console.log('Error: ' + error.message);
          }

          console.log(colors.red(`rush ${this.actionName} - Errors! (${stopwatch.toString()})`));
        }

        this._doAfterTask(stopwatch, false);
        throw new AlreadyReportedError();
      });
  }

  protected onDefineParameters(): void {
    if (this._enableParallelism) {
      this._parallelismParameter = this.defineStringParameter({
        parameterLongName: '--parallelism',
        parameterShortName: '-p',
        argumentName: 'COUNT',
        environmentVariable: EnvironmentVariableNames.RUSH_PARALLELISM,
        description:
          'Specifies the maximum number of concurrent processes to launch during a build.' +
          ' The COUNT should be a positive integer or else the word "max" to specify a count that is equal to' +
          ' the number of CPU cores. If this parameter is omitted, then the default value depends on the' +
          ' operating system and number of CPU cores.'
      });
    }
    this._toFlag = this.defineStringListParameter({
      parameterLongName: '--to',
      parameterShortName: '-t',
      argumentName: 'PROJECT1',
      description:
        'Run command in the specified project and all of its dependencies. "." can be used as shorthand ' +
        'to specify the project in the current working directory.'
    });
    this._fromVersionPolicy = this.defineStringListParameter({
      parameterLongName: '--from-version-policy',
      argumentName: 'VERSION_POLICY_NAME',
      description:
        'Run command in all projects with the specified version policy ' +
        'and all projects that directly or indirectly depend on projects with the specified version policy'
    });
    this._toVersionPolicy = this.defineStringListParameter({
      parameterLongName: '--to-version-policy',
      argumentName: 'VERSION_POLICY_NAME',
      description:
        'Run command in all projects with the specified version policy and all of their dependencies'
    });
    this._fromFlag = this.defineStringListParameter({
      parameterLongName: '--from',
      parameterShortName: '-f',
      argumentName: 'PROJECT2',
      description:
        'Run command in the specified project and all projects that directly or indirectly depend on the ' +
        'specified project. "." can be used as shorthand to specify the project in the current working directory.'
    });
    this._verboseParameter = this.defineFlagParameter({
      parameterLongName: '--verbose',
      parameterShortName: '-v',
      description: 'Display the logs during the build, rather than just displaying the build status summary'
    });
    if (this._isIncrementalBuildAllowed) {
      this._changedProjectsOnly = this.defineFlagParameter({
        parameterLongName: '--changed-projects-only',
        parameterShortName: '-o',
        description:
          'If specified, the incremental build will only rebuild projects that have changed, ' +
          'but not any projects that directly or indirectly depend on the changed package.'
      });
    }

    this.defineScriptParameters();
  }

  private _doBeforeTask(): void {
    if (
      this.actionName !== RushConstants.buildCommandName &&
      this.actionName !== RushConstants.rebuildCommandName
    ) {
      // Only collects information for built-in tasks like build or rebuild.
      return;
    }

    SetupChecks.validate(this.rushConfiguration);

    this.eventHooksManager.handle(Event.preRushBuild, this.parser.isDebug);
  }

  private _doAfterTask(stopwatch: Stopwatch, success: boolean): void {
    if (
      this.actionName !== RushConstants.buildCommandName &&
      this.actionName !== RushConstants.rebuildCommandName
    ) {
      // Only collects information for built-in tasks like build or rebuild.
      return;
    }
    this._collectTelemetry(stopwatch, success);
    this.parser.flushTelemetry();
    this.eventHooksManager.handle(Event.postRushBuild, this.parser.isDebug);
  }

  private _collectTelemetry(stopwatch: Stopwatch, success: boolean): void {
    const extraData: { [key: string]: string } = {
      command_to: (this._toFlag.values.length > 0).toString(),
      command_from: (this._fromFlag.values.length > 0).toString()
    };

    for (const customParameter of this.customParameters) {
      switch (customParameter.kind) {
        case CommandLineParameterKind.Flag:
        case CommandLineParameterKind.Choice:
        case CommandLineParameterKind.String:
        case CommandLineParameterKind.Integer:
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          extraData[customParameter.longName] = JSON.stringify((customParameter as any).value);
          break;
        default:
          extraData[customParameter.longName] = '?';
      }
    }

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
