/// <reference path="../typings/tsd.d.ts" />

import * as child_process from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import RushConfigLoader, { IRushConfig } from './RushConfigLoader';
import { getCommonFolder } from './ExecuteLink';
import TaskOutputManager from './TaskOutputManager';

const OutputManager = new TaskOutputManager();

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
    const { write, writeLine } = OutputManager.registerTask(projectName);

    writeLine(`> Project [${projectName}]:`);
    const projectFolder = getProjectFolder(projectName);

    const options = {
      cwd: projectFolder,
      stdio: [0, 1, 2] // (omit this to suppress gulp console output)
    };

    const fullPathToGulp = path.join(getCommonFolder(), 'node_modules/.bin/gulp');

    writeLine('gulp nuke');
    child_process.execSync(fullPathToGulp + ' nuke', options);

    writeLine('gulp test');
    const buildTask = child_process.exec(fullPathToGulp + ' test', options);

    buildTask.stdout.on('data', (data: string) => {
      write(data);
    });

    buildTask.on('exit', (code: number) => {
      writeLine(`> Finished [${projectName}]!`);
      OutputManager.completeTask(projectName);
      resolve();
    });
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
  promiseChain.then(() => {
    console.log('');
    console.log('Done!');
  });
};

