/// <reference path="../typings/tsd.d.ts" />

import * as child_process from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import RushConfigLoader, { IRushConfig } from './RushConfigLoader';

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

/**
 * Entry point for the "rush rebuild" command.
 */
export default function executeBuild(params: any): void {
  let config: IRushConfig = RushConfigLoader.load();
  let skipTest: boolean = params.notest;

  config.projects.forEach((project) => {
    console.log('');
    console.log('PROJECT: ' + project);
    let projectFolder = getProjectFolder(project);

    let options = {
      cwd: projectFolder,
      stdio: [0, 1, 2] // (omit this to suppress gulp console output)
    };

    console.log('gulp nuke');
    child_process.execSync('gulp nuke', options);

    console.log('gulp bundle');
    child_process.execSync('gulp bundle', options);

    if (!skipTest) {
      console.log('gulp test');
      child_process.execSync('gulp test', options);
    }
  });

  console.log('');
  console.log('Done!');
};

