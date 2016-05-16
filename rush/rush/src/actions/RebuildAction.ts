/**
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 */

import * as colors from 'colors';

import * as ErrorDetectorRules from '../errorDetection/rules/index';
import CommandLineAction from '../commandLine/CommandLineAction';
import ErrorDetector, { ErrorDetectionMode } from '../errorDetection/ErrorDetector';
import JsonFile from '../utilities/JsonFile';
import RushCommandLineParser from './RushCommandLineParser';
import RushConfig, { IRushLinkJson } from '../data/RushConfig';
import ProjectBuildTask from '../taskRunner/ProjectBuildTask';
import TaskRunner from '../taskRunner/TaskRunner';
import { CommandLineFlagParameter } from '../commandLine/CommandLineParameter';

export default class RebuildAction extends CommandLineAction {
  private _parser: RushCommandLineParser;
  private _rushConfig: RushConfig;
  private _quietParameter: CommandLineFlagParameter;
  private _productionParameter: CommandLineFlagParameter;
  private _vsoParameter: CommandLineFlagParameter;

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
  }

  protected onExecute(): void {
    this._rushConfig = this._rushConfig = RushConfig.loadFromDefaultLocation();

    const taskRunner: TaskRunner = new TaskRunner(this._quietParameter.value);

    // Create tasks and register with tax runner
    for (const rushProject of this._rushConfig.projects) {
      const errorMode = this._vsoParameter.value
        ? ErrorDetectionMode.VisualStudioOnline
        : ErrorDetectionMode.LocalBuild;

      const activeRules = [
        ErrorDetectorRules.TestErrorDetector,
        ErrorDetectorRules.TsErrorDetector,
        ErrorDetectorRules.TsLintErrorDetector
      ];
      const errorDetector = new ErrorDetector(activeRules);
      const projectTask = new ProjectBuildTask(rushProject, errorDetector, errorMode,
        this._productionParameter.value);
      taskRunner.addTask(projectTask);
    }

    // Add task dependencies
    const rushLinkJson: IRushLinkJson = JsonFile.loadJsonFile(this._rushConfig.rushLinkJsonFilename);
    for (const projectName of Object.keys(rushLinkJson.localLinks)) {
      const projectDependencies: string[] = rushLinkJson.localLinks[projectName];
      taskRunner.addDependencies(projectName, projectDependencies);
    }

    taskRunner.execute().then(
      () => {
        console.log(colors.green('rush rebuild - Done!'));
      },
      () => {
        console.log(colors.red('rush rebuild - Errors!'));
        process.exit(1);
      });
  }
}
