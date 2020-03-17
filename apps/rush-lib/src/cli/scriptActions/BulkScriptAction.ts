// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'os';
import * as colors from 'colors';

import {
  Event
} from '../../index';

import {
  CommandLineFlagParameter,
  CommandLineStringParameter,
  CommandLineStringListParameter,
  CommandLineParameterKind
} from '@microsoft/ts-command-line';

import { SetupChecks } from '../../logic/SetupChecks';
import { TaskSelector } from '../../logic/TaskSelector';
import { Stopwatch } from '../../utilities/Stopwatch';
import { AlreadyReportedError } from '../../utilities/AlreadyReportedError';
import { BaseScriptAction, IBaseScriptActionOptions } from './BaseScriptAction';
import {
  FileSystem,
  PackageJsonLookup,
  IPackageJson
} from '@rushstack/node-core-library';
import { TaskRunner } from '../../logic/taskRunner/TaskRunner';
import { TaskCollection } from '../../logic/taskRunner/TaskCollection';
import { Utilities } from '../../utilities/Utilities';

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

  public run(): Promise<void> {
    if (!FileSystem.exists(this.rushConfiguration.rushLinkJsonFilename)) {
      throw new Error(`File not found: ${this.rushConfiguration.rushLinkJsonFilename}` +
        `${os.EOL}Did you run "rush link"?`);
    }
    this._doBeforeTask();

    const stopwatch: Stopwatch = Stopwatch.start();

    const isQuietMode: boolean = !(this._verboseParameter.value);

    // if this is parallelizable, then use the value from the flag (undefined or a number),
    // if parallelism is not enabled, then restrict to 1 core
    const parallelism: string | undefined = this._enableParallelism
      ? this._parallelismParameter!.value
      : '1';

    // Collect all custom parameter values
    const customParameterValues: string[] = [];
    for (const customParameter of this.customParameters) {
      customParameter.appendToArgList(customParameterValues);
    }

    const changedProjectsOnly: boolean = this._isIncrementalBuildAllowed && this._changedProjectsOnly.value;

    const taskSelector: TaskSelector = new TaskSelector({
      rushConfiguration: this.rushConfiguration,
      toFlags: this._mergeProjectsWithVersionPolicy(this._toFlag, this._toVersionPolicy),
      fromFlags: this._mergeProjectsWithVersionPolicy(this._fromFlag, this._fromVersionPolicy),
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

    const taskRunner: TaskRunner = new TaskRunner(
      taskCollection.getOrderedTasks(),
      {
        quietMode: isQuietMode,
        parallelism: parallelism,
        changedProjectsOnly: changedProjectsOnly,
        allowWarningsInSuccessfulBuild: this._allowWarningsInSuccessfulBuild
      }
    );

    return taskRunner.execute().then(() => {
      stopwatch.stop();
      console.log(colors.green(`rush ${this.actionName} (${stopwatch.toString()})`));
      this._doAfterTask(stopwatch, true);
    }).catch((error: Error) => {
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
        description: 'Specify the number of concurrent build processes'
          + ' The value "max" can be specified to indicate the number of CPU cores.'
          + ' If this parameter omitted, the default value depends on the operating system and number of CPU cores.'
      });
    }
    this._toFlag = this.defineStringListParameter({
      parameterLongName: '--to',
      parameterShortName: '-t',
      argumentName: 'PROJECT1',
      description: 'Run command in the specified project and all of its dependencies. "." can be used as shorthand ' +
        'to specify the project in the current working directory.'
    });
    this._fromVersionPolicy =  this.defineStringListParameter({
      parameterLongName: '--from-version-policy',
      argumentName: 'VERSION_POLICY_NAME',
      description: 'Run command in all projects with the specified version policy '
        + 'and all projects that directly or indirectly depend on projects with the specified version policy'
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
      description: 'Run command in all projects that directly or indirectly depend on the specified project. ' +
        '"." can be used as shorthand to specify the project in the current working directory.'
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
        description: 'If specified, the incremental build will only rebuild projects that have changed, '
          + 'but not any projects that directly or indirectly depend on the changed package.'
      });
    }

    this.defineScriptParameters();
  }

  private _mergeProjectsWithVersionPolicy(
    projectsParameters: CommandLineStringListParameter,
    versionPoliciesParameters: CommandLineStringListParameter
  ): string[] {
    const packageJsonLookup: PackageJsonLookup = new PackageJsonLookup();

    const projects: string[] = [];
    for (const projectParameter of projectsParameters.values) {
      if (projectParameter === '.') {
        const packageJson: IPackageJson | undefined = packageJsonLookup.tryLoadPackageJsonFor(process.cwd());
        if (packageJson) {
          const projectName: string = packageJson.name;
          if (this.rushConfiguration.projectsByName.has(projectName)) {
            projects.push(projectName);
          } else {
            console.log(colors.red(
              'Rush is not currently running in a project directory specified in rush.json. ' +
              `The "." value for the ${this._toFlag.longName} parameter or the ${this._fromFlag.longName} parameter ` +
              'is not allowed.'
            ));
            throw new AlreadyReportedError();
          }
        } else {
          console.log(colors.red(
            'Rush is not currently running in a project directory. ' +
            `The "." value for the ${this._toFlag.longName} parameter or the ${this._fromFlag.longName} parameter ` +
            'is not allowed.'
          ));
          throw new AlreadyReportedError();
        }
      } else {
        projects.push(projectParameter);
      }
    }

    if (versionPoliciesParameters.values && versionPoliciesParameters.values.length > 0) {
      this.rushConfiguration.projects.forEach(project => {
        const matches: boolean = versionPoliciesParameters.values.some(policyName => {
          return project.versionPolicyName === policyName;
        });
        if (matches) {
          projects.push(project.packageName);
        }
      });
    }

    return projects;
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
