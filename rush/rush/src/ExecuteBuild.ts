/**
 * @file ExecuteBuild.ts
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 *
 * Executes the building of all projects by constructing build tasks
 * and using the TaskRunner to execute them in the proper order
 */

import * as colors from 'colors';
import RushConfigLoader, { IRushConfig, IRushProjectConfig } from './RushConfigLoader';
import TaskRunner from './taskRunner/TaskRunner';
import ProjectBuildTask from './ProjectBuildTask';
import ErrorDetector, { ErrorDetectionMode } from './errorDetection/ErrorDetector';
import * as ErrorDetectorRules from './errorDetection/rules/index';

/**
 * Entry point for the "rush rebuild" command.
 */
export default function executeBuild(params: any): void {
  const config: IRushConfig = RushConfigLoader.load();
  const projects = config.projects;
  const vsoMode = params.vso;
  const quietMode = params.quiet;

  const taskRunner = new TaskRunner(quietMode);

  // Create tasks and register with tax runner
  projects.forEach((project: IRushProjectConfig) => {
    const errorMode = vsoMode ? ErrorDetectionMode.VisualStudioOnline : ErrorDetectionMode.LocalBuild;

    const activeRules = [
      ErrorDetectorRules.TestErrorDetector,
      ErrorDetectorRules.TsErrorDetector,
      ErrorDetectorRules.TsLintErrorDetector
    ];
    const errorDetector = new ErrorDetector(activeRules);
    const projectTask = new ProjectBuildTask(project, errorDetector, errorMode);
    taskRunner.addTask(projectTask);
  });

  // Add task dependencies
  projects.forEach((project: IRushProjectConfig) => {
    taskRunner.addDependencies(project.packageName, project.dependencies);
  });

  taskRunner.execute().then(
    () => {
      console.log(colors.green('rush rebuild - Done!'));
    },
    () => {
      console.log(colors.red('rush rebuild - Errors!'));
      process.exit(1);
    });
};
