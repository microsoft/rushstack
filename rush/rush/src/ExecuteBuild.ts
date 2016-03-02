/**
 * @file ExecuteBuild.ts
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 *
 * Executes the building of all projects by constructing build tasks
 * and using the TaskRunner to execute them in the proper order
 */

import * as colors from 'colors';
import RushConfigLoader, { IRushConfig } from './RushConfigLoader';
import TaskRunner from './taskRunner/TaskRunner';
import ProjectBuildTask from './ProjectBuildTask';
import { ErrorDetectionMode } from './ErrorDetector';

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
  Object.keys(projects).forEach((projectName: string) => {
    const errorMode = vsoMode ? ErrorDetectionMode.VisualStudioOnline : ErrorDetectionMode.LocalBuild;
    const projectTask = new ProjectBuildTask(projectName, projects[projectName], errorMode);
    taskRunner.addTask(projectTask);
  });

  // Add task dependencies
  Object.keys(projects).forEach((projectName: string) => {
    const projectConfig = projects[projectName];
    taskRunner.addDependencies(projectName, projectConfig.dependencies);
  });

  taskRunner.execute().then(() => {
    console.log(colors.green('rush rebuild - Done!'));
  });
};
