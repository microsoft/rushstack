/**
 * @file ExecuteBuild.ts
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 *
 * Executes the building of all projects by constructing build tasks
 * and using the TaskRunner to execute them in the proper order
 */

import * as colors from 'colors';
import RushConfig, { IRushLinkJson } from '../data/RushConfig';
import TaskRunner from '../taskRunner/TaskRunner';
import ProjectBuildTask from '../taskRunner/ProjectBuildTask';
import ErrorDetector, { ErrorDetectionMode } from '../errorDetection/ErrorDetector';
import * as ErrorDetectorRules from '../errorDetection/rules/index';
import JsonFile from '../utilities/JsonFile';

export interface IExecuteBuildOptions {
  production?: boolean;
  vso?: boolean;
  quiet?: boolean;
}

/**
 * Entry point for the "rush rebuild" command.
 */
export default function executeBuild(rushConfig: RushConfig, options: IExecuteBuildOptions): void {
  const taskRunner: TaskRunner = new TaskRunner(options.quiet);

  // Create tasks and register with tax runner
  for (const rushProject of rushConfig.projects) {
    const errorMode = options.vso ? ErrorDetectionMode.VisualStudioOnline : ErrorDetectionMode.LocalBuild;

    const activeRules = [
      ErrorDetectorRules.TestErrorDetector,
      ErrorDetectorRules.TsErrorDetector,
      ErrorDetectorRules.TsLintErrorDetector
    ];
    const errorDetector = new ErrorDetector(activeRules);
    const projectTask = new ProjectBuildTask(rushProject, errorDetector, errorMode, options.production);
    taskRunner.addTask(projectTask);
  }

  // Add task dependencies
  const rushLinkJson: IRushLinkJson = JsonFile.loadJsonFile(rushConfig.rushLinkJsonFilename);
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
};
