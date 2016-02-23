/// <reference path="../typings/tsd.d.ts" />

import * as child_process from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import RushConfigLoader, { IRushConfig } from './RushConfigLoader';
import { getCommonFolder } from './ExecuteLink';

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

function buildProject(projectName: string): Promise<void> {
  return new Promise<void>((resolve: () => void, reject: () => void) => {
    console.log('');
    console.log('PROJECT: ' + projectName);
    let projectFolder = getProjectFolder(projectName);

    let options = {
      cwd: projectFolder,
      stdio: [0, 1, 2] // (omit this to suppress gulp console output)
    };

    let fullPathToGulp = path.join(getCommonFolder(), 'node_modules/.bin/gulp');

    console.log('gulp nuke');
    child_process.execSync(fullPathToGulp + ' nuke', options);

    console.log('gulp bundle');
    child_process.execSync(fullPathToGulp + ' bundle', options);

    resolve();
  });
}

/**
 * Entry point for the "rush rebuild" command.
 */
export default function executeBuild(params: any): void {
  let config: IRushConfig = RushConfigLoader.load();

  let promiseChain: Promise<void> = undefined;
  config.projects.forEach((project) => {
    if (!promiseChain) {
      promiseChain = buildProject(project);
    } else {
      promiseChain = promiseChain.then(() => buildProject(project));
    }
  });

  console.log('');
  console.log('Done!');
};

