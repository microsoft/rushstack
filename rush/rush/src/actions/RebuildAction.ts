/**
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 */

import * as colors from 'colors';
import * as fs from 'fs';
import * as os from 'os';
import {
  CommandLineAction,
  CommandLineFlagParameter,
  CommandLineIntegerParameter
} from '@microsoft/ts-command-line';
import {
  TestErrorDetector,
  TsErrorDetector,
  TsLintErrorDetector,
  ErrorDetector,
  ErrorDetectionMode,
  IErrorDetectionRule,
  JsonFile,
  RushConfig,
  IRushLinkJson,
  Utilities
} from '@microsoft/rush-lib';

import RushCommandLineParser from './RushCommandLineParser';
import ProjectBuildTask from '../taskRunner/ProjectBuildTask';
import TaskRunner from '../taskRunner/TaskRunner';

export default class RebuildAction extends CommandLineAction {
  private _parser: RushCommandLineParser;
  private _rushConfig: RushConfig;
  private _quietParameter: CommandLineFlagParameter;
  private _productionParameter: CommandLineFlagParameter;
  private _vsoParameter: CommandLineFlagParameter;
  private _npmParamter: CommandLineFlagParameter;
  private _parallelismParameter: CommandLineIntegerParameter;

  constructor(parser: RushCommandLineParser) {
    super({
      actionVerb: 'rebuild',
      summary: 'Clean and rebuild the entire set of projects',
      documentation: 'The Rush rebuild command assumes that the package.json file for each'
      + ' project will contain scripts for "npm run clean" and "npm run test".  It invokes'
      + ' these commands to build each project.  Projects are built in parallel where'
      + ' possible, but always respecting the dependency graph for locally linked projects.'
    });
    this._parser = parser;
  }

  protected onDefineParameters(): void {
    this._quietParameter = this.defineFlagParameter({
      parameterLongName: '--quiet',
      parameterShortName: '-q',
      description: 'Only show errors and overall build status'
    });
    this._productionParameter = this.defineFlagParameter({
      parameterLongName: '--production',
      description: 'Perform a production build'
    });
    this._vsoParameter = this.defineFlagParameter({
      parameterLongName: '--vso',
      description: 'Display error messages in the format expected by Visual Studio Online'
    });
    this._npmParamter = this.defineFlagParameter({
      parameterLongName: '--npm',
      description: 'Perform a npm-mode build. Designed for building code for distribution on NPM'
    });
    this._parallelismParameter = this.defineIntegerParameter({
      parameterLongName: '--parallelism',
      parameterShortName: '-p',
      description: 'Limit the number of active builds to N simultaneous processes'
    });
  }

  protected onExecute(): void {
    this._rushConfig = this._rushConfig = RushConfig.loadFromDefaultLocation();

    console.log('Starting "rush rebuild"' + os.EOL);
    const startTime: number = Utilities.getTimeInMs();

    const taskRunner: TaskRunner = new TaskRunner(this._quietParameter.value, this._parallelismParameter.value);

    // Create tasks and register with tax runner
    for (const rushProject of this._rushConfig.projects) {
      const errorMode: ErrorDetectionMode = this._vsoParameter.value
        ? ErrorDetectionMode.VisualStudioOnline
        : ErrorDetectionMode.LocalBuild;

      const activeRules: IErrorDetectionRule[] = [
        TestErrorDetector,
        TsErrorDetector,
        TsLintErrorDetector
      ];
      const errorDetector: ErrorDetector = new ErrorDetector(activeRules);
      const projectTask: ProjectBuildTask = new ProjectBuildTask(rushProject,
                                                                 this._rushConfig,
                                                                 errorDetector,
                                                                 errorMode,
                                                                 this._productionParameter.value,
                                                                 this._npmParamter.value);
      taskRunner.addTask(projectTask);
    }

    // Add task dependencies
    if (!fs.existsSync(this._rushConfig.rushLinkJsonFilename)) {
      throw new Error('File not found: ' + this._rushConfig.rushLinkJsonFilename
        + os.EOL + 'Did you run "rush link"?');
    }

    const rushLinkJson: IRushLinkJson = JsonFile.loadJsonFile(this._rushConfig.rushLinkJsonFilename);
    for (const projectName of Object.keys(rushLinkJson.localLinks)) {
      const projectDependencies: string[] = rushLinkJson.localLinks[projectName];
      taskRunner.addDependencies(projectName, projectDependencies);
    }

    taskRunner.execute()
      .then(
      () => {
        const endTime: number = Utilities.getTimeInMs();
        const totalSeconds: string = ((endTime - startTime) / 1000.0).toFixed(2);

        console.log(colors.green(`rush rebuild - completed in ${totalSeconds} seconds!`));
      },
      () => {
        console.log(colors.red(`rush rebuild - Errors!`));
        process.exit(1);
      });
  }
}
