/// <reference path="../typings/tsd.d.ts" />

import * as child_process from 'child_process';
import colors = require('colors');
import * as fs from 'fs';
import * as path from 'path';
import RushConfigLoader, { IRushConfig, IRushProjects, IRushProjectConfig } from './RushConfigLoader';
import { getCommonFolder } from './ExecuteLink';
import TaskOutputManager from './TaskOutputManager';
import ErrorDetector, { ErrorDetectionMode } from './ErrorDetector';

const OutputManager: TaskOutputManager = new TaskOutputManager();

/**
 * Returns the folder path for the specified project, e.g. "./lib1"
 * for "lib1".  Reports an error if the folder does not exist.
 */
function getProjectFolder(project: string): string {
  let projectFolder = path.join(path.resolve('.'), project);
  if (!fs.existsSync(projectFolder)) {
    throw new Error(`Project folder not found: ${project}`);
  }
  return projectFolder;
}

function buildProject(projectName: string, mode: ErrorDetectionMode): Promise<void> {
  return new Promise<void>((resolve: () => void, reject: () => void) => {
    const { write, writeLine } = OutputManager.registerTask(projectName);

    writeLine(`> Project [${projectName}]:`);
    const projectFolder = getProjectFolder(projectName);

    const options = {
      cwd: projectFolder,
      stdio: [0, 1, 2] // (omit this to suppress gulp console output)
    };

    const fullPathToGulp = path.join(getCommonFolder(), 'node_modules/.bin/gulp');

    writeLine('gulp nuke');
    // child_process.execSync(fullPathToGulp + ' nuke', options);

    writeLine('gulp test');
    const buildTask = child_process.exec(fullPathToGulp + ' test', options);

    buildTask.stdout.on('data', (data: string) => {
      // write(data);
    });

    buildTask.stderr.on('data', (data: string) => {
      write(colors.red(data));
    });

    buildTask.on('exit', (code: number) => {
      const errors = ErrorDetector(OutputManager.getTaskOutput(projectName), mode);
      for (let i = 0; i < errors.length; i++) {
        writeLine(colors.red(errors[i]));
      }
      write(`> Finished [${projectName}]`);
      if (errors.length) {
        write(colors.red(` ${errors.length} Errors!!`));
      }
      writeLine('\n');

      OutputManager.completeTask(projectName);
      if (errors.length) {
        reject();
      } else {
        resolve();
      }
    });
  });
}

// Top level packages with no
interface IProjectBuildInfo extends IRushProjectConfig {
  dependents: Array<string>;
};

/**
 * Finds the list of projects which are dependent on the currentProject
 */
function findDependents(currentProject: string, projects: IRushProjects): Array<string> {
  const dependents: Array<string> = [];
  Object.keys(projects).forEach((project: string) => {
    if (projects[project].dependencies && currentProject in projects[project].dependencies) {
      dependents.push(currentProject);
    }
  });
  return dependents;
}

function buildDependencyGraph(projects: IRushProjects): Map<string, IProjectBuildInfo> {
  const projectBuildInfo: Map<string, IProjectBuildInfo> = new Map<string, IProjectBuildInfo>();
  Object.keys(projects).forEach((project: string) => {
    const projectInfo = projects[project];
    projectBuildInfo.set(project, {
      dependencies: projectInfo.dependencies ? projectInfo.dependencies : [],
      dependents: findDependents(project, projects),
      path: projectInfo.path
    });
  });
  return projectBuildInfo;
}

function getProjectsWithNoDependencies(projects: Map<string, IProjectBuildInfo>): Array<string> {
  const unblockedProjects: Array<string> = [];

  projects.forEach((projectInfo: IProjectBuildInfo, projectName: string) => {
    if (!projectInfo.dependencies.length) {
      unblockedProjects.push(projectName);
    }
  });

  return unblockedProjects;
}

/**
 *  This function modifies "projects", removing the completed project, as well as
 * removing the completed project from its dependencies' dependents list.
 * @param projectName
 * @param projects
 */
function markProjectAsCompleted(projectName: string, projects: Map<string, IProjectBuildInfo>) {
  projects.get(projectName).dependents.forEach((dependent: string) => {
    const dependentProjectDependenciesList = projects.get(dependent).dependencies;
    const i = dependentProjectDependenciesList.indexOf(dependent);
    dependentProjectDependenciesList.splice(i, 1);
  });

  projects.delete(projectName);
}

function queueBuilds(projects: Map<string, IProjectBuildInfo>): Promise<any> {
  const ready = getProjectsWithNoDependencies(projects);

  const buildPromises = ready.map((project: string) => {
    return buildProject(projects.get(project).path, ErrorDetectionMode.VisualStudioOnline).then(() => {
      markProjectAsCompleted(project, projects);
    });
  });

  return Promise.all(buildPromises).then(() => {
    return queueBuilds(projects);
  });
}

/**
 * Entry point for the "rush rebuild" command.
 */
export default function executeBuild(params: any): void {
  let config: IRushConfig = RushConfigLoader.load();

  queueBuilds(buildDependencyGraph(config.projects)).then(() => {
    console.log('');
    console.log('Done!');
  });
};

