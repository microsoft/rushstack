/// <reference path="../typings/tsd.d.ts" />

import * as colors from 'colors';
import RushConfigLoader, { IRushConfig, IRushProjectConfig } from './RushConfigLoader';
import TaskRunner from './taskRunner/TaskRunner';
import ProjectBuildTask from './ProjectBuildTask';
import { ErrorDetectionMode } from './ErrorDetector';

// Top level packages with no
interface IProjectBuildInfo extends IRushProjectConfig {
  dependents: Array<string>;
};

/**
 * Entry point for the "rush rebuild" command.
 */
export default function executeBuild(params: any): void {
  const config: IRushConfig = RushConfigLoader.load();
  const projects = config.projects;

  const taskRunner = new TaskRunner();

  // Create tasks and register with tax runner
  Object.keys(projects).forEach((projectName: string) => {
    const projectConfig = projects[projectName];

    taskRunner.addTask(new ProjectBuildTask(projectName,
      projectConfig, ErrorDetectionMode.VisualStudioOnline));
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
